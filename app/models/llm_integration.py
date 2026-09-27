from dataclasses import dataclass, field
from datetime import datetime

from app.models.company import Company


@dataclass(slots=True)
class LLMIntegration:
    id: str
    company: Company
    provider: str
    account_name: str
    api_key: str
    policy_name: str
    models: list[str]
    created_at: datetime
    updated_at: datetime
    status: str = 'active'
    version: int = 1
    system_prompt: str = ''
    base_url: str | None = None
    has_api_key: bool = False
    api_key_suffix: str | None = None
    model_prices: list[dict] = field(default_factory=list)
