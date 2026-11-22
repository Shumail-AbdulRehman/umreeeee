from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.red_team.catalog_schema import CATEGORIES
from app.red_team.plugins import PLUGIN_IDS, STRATEGY_IDS


class JudgeConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    integration_id: str
    model: str = Field(min_length=1, max_length=255)


class TestConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=2, max_length=120)
    integration_id: str
    model: str = Field(min_length=1, max_length=255)
    mode: Literal['raw', 'protected']
    subject_user_id: str | None = None
    format: Literal['plugins', 'categories'] = 'categories'
    attack_categories: list[str] | None = Field(default=None, min_length=1, max_length=5)
    num_attacks: int | None = Field(default=None, ge=1, le=100)
    plugins: list[str] | None = Field(default=None, min_length=1, max_length=8)
    strategies: list[str] = Field(default_factory=list, max_length=8)
    tests_per_plugin: int = Field(default=3, ge=1, le=10, strict=True)
    judge: JudgeConfig | None = None
    threshold_score: float = Field(default=.8, ge=0, le=1)
    seed: int = Field(default=1, ge=0, le=2147483647)
    temperature: float | None = Field(default=.2, ge=0, le=2)
    max_tokens: int = Field(default=256, ge=1, le=2048)

    @model_validator(mode='before')
    @classmethod
    def infer_format(cls, value):
        if isinstance(value, dict) and value.get('plugins') is not None and 'format' not in value:
            return {**value, 'format': 'plugins'}
        return value

    @field_validator('attack_categories', 'plugins', 'strategies')
    @classmethod
    def distinct_supported(cls, value, info):
        known = {'attack_categories': CATEGORIES, 'plugins': PLUGIN_IDS, 'strategies': STRATEGY_IDS}[info.field_name]
        if value is not None and (len(set(value)) != len(value) or set(value) - set(known)):
            raise ValueError('Choose distinct supported ' + info.field_name.replace('_', ' '))
        return value

    @model_validator(mode='after')
    def validate_format(self):
        errors = []
        def invalid(field, message):
            errors.append({'type': 'value_error', 'loc': (field,), 'input': getattr(self, field),
                           'ctx': {'error': ValueError(message)}})
        if self.format == 'plugins':
            if not self.plugins:
                invalid('plugins', 'Choose at least one plugin')
            count = len(self.plugins or []) * len(set(self.strategies) | {'basic'}) * self.tests_per_plugin
            if count > 100:
                invalid('tests_per_plugin', f'Attack count {count} exceeds the limit of 100')
            if self.attack_categories is not None:
                invalid('attack_categories', 'Categories belong to the earlier format')
            if self.num_attacks is not None and self.num_attacks != count:
                invalid('num_attacks', 'Attack count is derived from plugins, strategies and tests per plugin')
        else:
            for field in ('attack_categories', 'num_attacks'):
                if getattr(self, field) is None:
                    invalid(field, 'Required for the earlier format')
            if self.plugins is not None:
                invalid('plugins', 'Choose the plugins format')
            if self.strategies or self.judge:
                invalid('judge' if self.judge else 'strategies', 'Requires the plugins format')
        if errors:
            raise ValidationError.from_exception_data(type(self).__name__, errors)
        return self


class TestEdit(TestConfig):
    version: int = Field(ge=1)


class LaunchRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(ge=1)


class CloneRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['raw', 'protected'] | None = None
