from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.services import get_llm_integration_service
from app.models.user import User
from app.schemas.integrations import (
    LLMAvailableModelsRequest,
    LLMAvailableModelsResponse,
    LLMIntegrationCreateRequest,
    LLMIntegrationMutationResponse,
    LLMIntegrationsResponse,
    LLMIntegrationUpdateRequest,
)
from app.services.llm_integration_service import LLMIntegrationService


router = APIRouter(prefix='/api/integrations', tags=['integrations'])


@router.get('', response_model=LLMIntegrationsResponse)
def list_integrations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    llm_integration_service: LLMIntegrationService = Depends(get_llm_integration_service),
) -> LLMIntegrationsResponse:
    return llm_integration_service.list_integrations(current_user, page, page_size)


@router.post('/available-models', response_model=LLMAvailableModelsResponse)
def available_models(
    payload: LLMAvailableModelsRequest,
    current_user: User = Depends(get_current_user),
    llm_integration_service: LLMIntegrationService = Depends(get_llm_integration_service),
) -> LLMAvailableModelsResponse:
    return llm_integration_service.fetch_available_models(current_user, payload)


@router.post('', response_model=LLMIntegrationMutationResponse, status_code=status.HTTP_201_CREATED)
def create_integration(
    payload: LLMIntegrationCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    llm_integration_service: LLMIntegrationService = Depends(get_llm_integration_service),
) -> LLMIntegrationMutationResponse:
    return llm_integration_service.create_integration(current_user, payload, request.state.request_id)


@router.put('/{integration_id}', response_model=LLMIntegrationMutationResponse)
def update_integration(
    integration_id: str,
    payload: LLMIntegrationUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    llm_integration_service: LLMIntegrationService = Depends(get_llm_integration_service),
) -> LLMIntegrationMutationResponse:
    return llm_integration_service.update_integration(current_user, integration_id, payload, request.state.request_id)


@router.post('/{integration_id}/available-models', response_model=LLMAvailableModelsResponse)
def stored_available_models(integration_id: str, current_user: User = Depends(get_current_user),
                            llm_integration_service: LLMIntegrationService = Depends(get_llm_integration_service)):
    return llm_integration_service.fetch_stored_available_models(current_user, integration_id)


@router.get('/{integration_id}')
def get_integration(integration_id: str, current_user: User = Depends(get_current_user),
                    llm_integration_service: LLMIntegrationService = Depends(get_llm_integration_service)):
    return llm_integration_service.get_integration(current_user, integration_id)


class IntegrationStatusRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: str
    version: int = Field(ge=1)


@router.patch('/{integration_id}/status')
def set_integration_status(
    integration_id: str,
    payload: IntegrationStatusRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    llm_integration_service: LLMIntegrationService = Depends(get_llm_integration_service),
):
    return llm_integration_service.set_status(current_user, integration_id, payload.status,
                                               payload.version, request.state.request_id)
