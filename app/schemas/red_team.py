from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.red_team.catalog_schema import CATEGORIES


class TestConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=2, max_length=120)
    integration_id: str
    model: str = Field(min_length=1, max_length=255)
    mode: Literal['raw', 'protected']
    subject_user_id: str | None = None
    attack_categories: list[str] = Field(min_length=1, max_length=5)
    num_attacks: int = Field(ge=1, le=100)
    threshold_score: float = Field(default=.8, ge=0, le=1)
    seed: int = Field(default=1, ge=0, le=2147483647)
    temperature: float | None = Field(default=.2, ge=0, le=2)
    max_tokens: int = Field(default=256, ge=1, le=2048)

    @field_validator('attack_categories')
    @classmethod
    def valid_categories(cls, value):
        if len(set(value)) != len(value) or set(value) - set(CATEGORIES):
            raise ValueError('Choose distinct supported categories')
        return value


class TestEdit(TestConfig):
    version: int = Field(ge=1)


class LaunchRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(ge=1)


class CloneRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['raw', 'protected'] | None = None
