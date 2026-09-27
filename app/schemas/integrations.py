from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from decimal import Decimal, InvalidOperation


class ModelPrice(BaseModel):
    model_config = ConfigDict(extra='forbid')
    model: str = Field(min_length=1, max_length=200)
    input_usd_per_million: str
    output_usd_per_million: str
    effective_at: datetime | None = None

    @field_validator('input_usd_per_million', 'output_usd_per_million')
    @classmethod
    def nonnegative(cls, value):
        try:
            amount = Decimal(value)
        except (InvalidOperation, TypeError) as exc:
            raise ValueError('Enter a decimal price') from exc
        if not amount.is_finite() or amount < 0 or amount > 100000:
            raise ValueError('Price must be a nonnegative finite amount at most 100000')
        return str(amount)


class LLMIntegrationCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    provider: str = Field(min_length=2, max_length=64)
    account_name: str = Field(min_length=2, max_length=160)
    api_key: str | None = Field(default=None, max_length=512)
    system_prompt: str = Field(default='', max_length=12000)
    base_url: str | None = Field(default=None, max_length=500)
    models: list[str] = Field(min_length=1, max_length=50)
    model_prices: list[ModelPrice] = Field(default_factory=list, max_length=50)


class LLMIntegrationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(ge=1)
    provider: str = Field(min_length=2, max_length=64)
    account_name: str = Field(min_length=2, max_length=160)
    api_key: str | None = Field(default=None, max_length=512)
    system_prompt: str = Field(default='', max_length=12000)
    base_url: str | None = Field(default=None, max_length=500)
    models: list[str] = Field(min_length=1, max_length=50)
    model_prices: list[ModelPrice] = Field(default_factory=list, max_length=50)


class LLMIntegrationRead(BaseModel):
    id: str
    provider: str
    account_name: str
    masked_api_key: str
    has_api_key: bool
    status: str
    policy_count: int = 0
    version: int
    system_prompt: str
    base_url: str | None
    legacy_policy_name: str
    models: list[str]
    model_prices: list[ModelPrice] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class LLMIntegrationsResponse(BaseModel):
    items: list[LLMIntegrationRead]
    page: int
    page_size: int
    total: int


class LLMIntegrationMutationResponse(BaseModel):
    integration: LLMIntegrationRead
    message: str


class LLMAvailableModelsRequest(BaseModel):
    provider: str = Field(min_length=2, max_length=64)
    api_key: str | None = Field(default=None, max_length=512)
    base_url: str | None = Field(default=None, max_length=500)


class LLMAvailableModelsResponse(BaseModel):
    provider: str
    models: list[str]
