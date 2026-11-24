from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.red_team.catalog import PLUGINS, STRATEGIES, estimated_target_calls


class GraderConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    integration_id: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=255)

    @field_validator('integration_id', 'model')
    @classmethod
    def strip_text(cls, value):
        return value.strip()


class TestConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=2, max_length=120)
    purpose: str = Field(min_length=20, max_length=2000)
    integration_id: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=255)
    mode: Literal['raw', 'protected']
    subject_user_id: str | None = Field(default=None, max_length=64)
    plugins: list[str] = Field(min_length=1, max_length=20)
    strategies: list[str] = Field(default_factory=list, max_length=8)
    tests_per_plugin: int = Field(default=1, ge=1, le=10, strict=True)
    grader: GraderConfig
    threshold_score: float = Field(default=.8, ge=0, le=1)

    @field_validator('name', 'purpose', 'integration_id', 'model')
    @classmethod
    def strip_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Cannot be blank')
        return value

    @field_validator('subject_user_id')
    @classmethod
    def strip_subject(cls, value):
        return value.strip() if value else None

    @field_validator('plugins')
    @classmethod
    def distinct_plugins(cls, value):
        if len(set(value)) != len(value) or any(plugin not in PLUGINS for plugin in value):
            raise ValueError('Choose distinct supported plugins')
        return value

    @field_validator('strategies')
    @classmethod
    def distinct_strategies(cls, value):
        if 'basic' in value:
            raise ValueError('Baseline strategy is implicit')
        if len(set(value)) != len(value) or any(strategy not in STRATEGIES for strategy in value):
            raise ValueError('Choose distinct supported strategies')
        return value

    @model_validator(mode='after')
    def validate_cross_fields(self):
        errors = []

        def invalid(field, message):
            errors.append({
                'type': 'value_error', 'loc': (field,), 'input': getattr(self, field),
                'ctx': {'error': ValueError(message)},
            })

        if self.mode == 'protected' and not self.subject_user_id:
            invalid('subject_user_id', 'Protected tests require a subject user')
        calls = estimated_target_calls(self.plugins, self.strategies, self.tests_per_plugin)
        if calls > 200:
            invalid('tests_per_plugin', f'Estimated target calls {calls} exceed the limit of 200')
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
