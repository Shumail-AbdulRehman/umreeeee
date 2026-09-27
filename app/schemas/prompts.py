from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PromptWorkspaceIntegrationRead(BaseModel):
    id: str
    provider: str
    account_name: str
    policy_name: str
    models: list[str]


class PromptWorkspaceContextResponse(BaseModel):
    integrations: list[PromptWorkspaceIntegrationRead]


class PromptRunExecuteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    integration_id: str = Field(min_length=12, max_length=64)
    model: str = Field(min_length=1, max_length=255)
    prompt: str = Field(min_length=1, max_length=24000)
    temperature: float | None = Field(default=0.2, ge=0, le=2)
    max_tokens: int | None = Field(default=1024, ge=1, le=8192)


class PromptRunRead(BaseModel):
    id: str
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


class PromptRunExecutionResponse(BaseModel):
    run: PromptRunRead


class PromptRunsResponse(BaseModel):
    runs: list[PromptRunRead]
