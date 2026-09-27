from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class PromptRun:
    id: str
    company_id: str
    user_id: str
    user_name: str
    user_email: str
    integration_id: str
    integration_account_name: str
    provider: str
    model: str
    prompt: str
    system_prompt: str
    response_text: str
    selected_groups: list[str]
    policy_name: str
    status: str
    error_message: str | None
    latency_ms: int | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    created_at: datetime
