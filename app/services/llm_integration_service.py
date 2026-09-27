from datetime import datetime, timezone
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.models.llm_integration import LLMIntegration
from app.core.config import ALLOWED_OLLAMA_ORIGINS
from app.core.permissions import require_admin
from app.core.errors import DomainError
from app.db.mongo import get_database
from app.services.admin_common import audit, company_id, transaction
from app.models.user import User
from app.repositories.llm_integration_repository import LLMIntegrationRepository
from app.schemas.integrations import (
    LLMAvailableModelsRequest,
    LLMAvailableModelsResponse,
    LLMIntegrationCreateRequest,
    LLMIntegrationMutationResponse,
    LLMIntegrationRead,
    LLMIntegrationsResponse,
    LLMIntegrationUpdateRequest,
)


SUPPORTED_PROVIDERS = ('openai', 'groq', 'ollama', 'gemini', 'deepseek', 'anthropic')

OPENAI_COMPATIBLE_PROVIDERS = {
    'openai': 'https://api.openai.com/v1/models',
    'groq': 'https://api.groq.com/openai/v1/models',
    'deepseek': 'https://api.deepseek.com/models',
}


class RejectRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise HTTPException(status_code=502, detail='Provider redirect is not allowed')


PROVIDER_OPENER = build_opener(RejectRedirect)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class LLMIntegrationService:
    def __init__(self, integration_repository: LLMIntegrationRepository):
        self.integration_repository = integration_repository

    @staticmethod
    def ensure_manager(current_user: User) -> None:
        require_admin(current_user)

    @staticmethod
    def normalize_provider(provider: str) -> str:
        normalized = provider.strip().lower()
        if normalized not in SUPPORTED_PROVIDERS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Select a supported provider',
            )
        return normalized

    @staticmethod
    def normalize_account_name(account_name: str) -> str:
        normalized = ' '.join(account_name.strip().split())
        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Account name is required',
            )
        return normalized

    @staticmethod
    def normalize_policy_name(policy_name: str) -> str:
        normalized = ' '.join(policy_name.strip().split())
        return normalized

    @staticmethod
    def normalize_api_key(api_key: str | None, *, required: bool) -> str | None:
        if api_key is None:
            if required:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail='API key is required',
                )
            return None

        normalized = api_key.strip()
        if not normalized:
            if required:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail='API key is required',
                )
            return None
        return normalized

    @staticmethod
    def normalize_remote_models(models: list[str]) -> list[str]:
        deduped: dict[str, str] = {}
        for model in models:
            normalized = ' '.join(model.strip().split())
            if not normalized or len(normalized) > 200:
                continue
            deduped.setdefault(normalized.lower(), normalized)
        return sorted(deduped.values(), key=str.lower)

    @staticmethod
    def normalize_models(models: list[str]) -> list[str]:
        normalized_models: list[str] = []
        seen: set[str] = set()
        for model in models:
            normalized = ' '.join(model.strip().split())
            if not normalized:
                continue
            if len(normalized) > 200:
                raise DomainError(422, 'invalid_model', 'Model names must be at most 200 characters',
                                  {'models': ['Model name is too long']})
            dedupe_key = normalized.lower()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            normalized_models.append(normalized)

        if not normalized_models:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Select at least one model',
            )
        return normalized_models

    @staticmethod
    def mask_api_key(api_key: str) -> str:
        return f'••••{api_key[-4:]}' if api_key else ''

    @staticmethod
    def validate_ollama_url(value: str | None) -> str:
        url = (value or ALLOWED_OLLAMA_ORIGINS[0]).rstrip('/')
        parsed = urlsplit(url)
        if (parsed.scheme not in {'http', 'https'} or not parsed.hostname or
                parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or
                url not in ALLOWED_OLLAMA_ORIGINS):
            raise DomainError(422, 'invalid_ollama_url', 'Ollama URL is not in the operator allowlist')
        return url

    @staticmethod
    def read_json_response(request: Request) -> dict:
        try:
            with PROVIDER_OPENER.open(request, timeout=15) as response:
                body = response.read().decode('utf-8')
        except HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f'Provider rejected model discovery ({exc.code})',
            ) from exc
        except URLError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Could not connect to provider',
            ) from exc
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='Could not connect to provider',
            ) from exc

        try:
            payload = json.loads(body)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail='Provider returned an invalid response while loading models',
            ) from exc
        if not isinstance(payload, dict):
            raise HTTPException(status_code=502, detail='Provider returned an invalid model list')
        return payload

    @staticmethod
    def model_rows(payload: dict, field: str) -> list[dict]:
        rows = payload.get(field)
        if not isinstance(rows, list) or any(not isinstance(item, dict) for item in rows):
            raise HTTPException(status_code=502, detail='Provider returned an invalid model list')
        return rows

    def fetch_openai_compatible_models(self, provider: str, api_key: str) -> list[str]:
        request = Request(
            OPENAI_COMPATIBLE_PROVIDERS[provider],
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            method='GET',
        )
        payload = self.read_json_response(request)
        models = [item.get('id', '') for item in self.model_rows(payload, 'data')
                  if isinstance(item.get('id', ''), str)]
        return self.normalize_remote_models(models)

    def fetch_gemini_models(self, api_key: str) -> list[str]:
        endpoint = f'https://generativelanguage.googleapis.com/v1beta/models?{urlencode({"key": api_key})}'
        request = Request(endpoint, method='GET')
        payload = self.read_json_response(request)
        models: list[str] = []
        for item in self.model_rows(payload, 'models'):
            if 'generateContent' not in item.get('supportedGenerationMethods', []):
                continue
            model_id = item.get('baseModelId') or item.get('name', '')
            if isinstance(model_id, str) and model_id:
                model_id = model_id.removeprefix('models/')
                models.append(model_id)
        return self.normalize_remote_models(models)

    def fetch_anthropic_models(self, api_key: str) -> list[str]:
        request = Request(
            'https://api.anthropic.com/v1/models',
            headers={
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            method='GET',
        )
        payload = self.read_json_response(request)
        models = [item.get('id', '') for item in self.model_rows(payload, 'data')
                  if isinstance(item.get('id', ''), str)]
        return self.normalize_remote_models(models)

    def fetch_ollama_models(self, base_url: str | None = None) -> list[str]:
        request = Request(f'{self.validate_ollama_url(base_url)}/api/tags', method='GET')
        payload = self.read_json_response(request)
        models = [item.get('model') or item.get('name') or ''
                  for item in self.model_rows(payload, 'models')
                  if isinstance(item.get('model') or item.get('name') or '', str)]
        return self.normalize_remote_models(models)

    def to_read(self, integration: LLMIntegration) -> LLMIntegrationRead:
        return LLMIntegrationRead(
            id=integration.id,
            provider=integration.provider,
            account_name=integration.account_name,
            masked_api_key=self.mask_api_key(integration.api_key) if integration.api_key else (
                f'••••{integration.api_key_suffix}' if integration.api_key_suffix else ''),
            has_api_key=integration.has_api_key or bool(integration.api_key),
            status=integration.status,
            policy_count=self.integration_repository.collection.database.policies.count_documents({
                'company_id': ObjectId(integration.company.id), 'scope.integration_ids': ObjectId(integration.id),
                'status': {'$ne': 'archived'}}),
            version=integration.version,
            system_prompt=integration.system_prompt,
            base_url=integration.base_url,
            legacy_policy_name=integration.policy_name,
            models=integration.models,
            model_prices=integration.model_prices,
            created_at=integration.created_at,
            updated_at=integration.updated_at,
        )

    def ensure_unique_account_name(
        self,
        current_user: User,
        provider: str,
        account_name: str,
        *,
        exclude_integration_id: str | None = None,
    ) -> None:
        existing = self.integration_repository.find_by_company_provider_account_name(
            current_user.company.id,
            provider,
            account_name,
        )
        if existing is not None and existing.id != exclude_integration_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='An integration with this provider and account name already exists',
            )

    def list_integrations(self, current_user: User, page=1, page_size=20) -> LLMIntegrationsResponse:
        self.ensure_manager(current_user)
        collection = self.integration_repository.collection
        query = {'company_id': company_id(current_user)}
        total = collection.count_documents(query)
        records = collection.find(query).sort([('created_at', -1), ('_id', -1)]).skip((page - 1) * page_size).limit(page_size)
        items = [self.to_read(self.integration_repository._to_model(record)) for record in records]
        return LLMIntegrationsResponse(items=items, page=page, page_size=page_size, total=total)

    def get_integration(self, current_user, integration_id):
        self.ensure_manager(current_user)
        item = self.integration_repository.find_by_id(integration_id, current_user.company.id)
        if item is None:
            raise DomainError(404, 'not_found', 'Integration not found')
        return {'integration': self.to_read(item)}

    def fetch_stored_available_models(self, current_user, integration_id):
        self.ensure_manager(current_user)
        item = self.integration_repository.find_by_id(integration_id, current_user.company.id, include_credential=True)
        if item is None:
            raise DomainError(404, 'not_found', 'Integration not found')
        return self.fetch_available_models(current_user, LLMAvailableModelsRequest(provider=item.provider,
                                           api_key=item.api_key, base_url=item.base_url))

    def set_status(self, current_user, integration_id, new_status, version, request_id):
        self.ensure_manager(current_user)
        if new_status not in {'active', 'archived'}:
            raise DomainError(422, 'invalid_status', 'Status must be active or archived')

        def operation(db, session):
            target = db.integrations.find_one({'_id': self.integration_repository._object_id(integration_id),
                                               'company_id': company_id(current_user)}, session=session)
            if target is None:
                raise DomainError(404, 'not_found', 'Integration not found')
            if target.get('version', 1) != version:
                raise DomainError(409, 'stale_version', 'Integration changed. Refresh and try again.')
            if new_status == 'archived':
                references = db.policies.count_documents({'company_id': company_id(current_user),
                    'scope.integration_ids': target['_id'], 'status': {'$ne': 'archived'}}, session=session)
                if references:
                    raise DomainError(409, 'integration_in_use', f'{references} policy reference(s) must be removed first')
            result = db.integrations.update_one({'_id': target['_id'], 'company_id': company_id(current_user), 'version': version},
                {'$set': {'status': new_status, 'updated_at': now_utc()}, '$inc': {'version': 1}}, session=session)
            if result.modified_count != 1:
                raise DomainError(409, 'stale_version', 'Integration changed. Refresh and try again.')
            audit(db, session, current_user, 'integration.status_changed', 'integration', target['_id'], request_id,
                  before={'status': target.get('status', 'active')}, after={'status': new_status})
            return {'integration': self.to_read(self.integration_repository._to_model(
                db.integrations.find_one({'_id': target['_id']}, session=session))),
                    'message': 'Integration status updated'}

        return transaction(current_user, operation)

    def fetch_available_models(
        self,
        current_user: User,
        payload: LLMAvailableModelsRequest,
    ) -> LLMAvailableModelsResponse:
        self.ensure_manager(current_user)
        if not get_database().companies.find_one({'_id': ObjectId(current_user.company.id),
                                                  'status': 'active'}, {'_id': 1}):
            raise DomainError(403, 'organization_unavailable', 'Organization is unavailable')
        provider = self.normalize_provider(payload.provider)
        api_key = self.normalize_api_key(payload.api_key, required=provider != 'ollama')

        if provider in OPENAI_COMPATIBLE_PROVIDERS:
            models = self.fetch_openai_compatible_models(provider, api_key or '')
        elif provider == 'gemini':
            models = self.fetch_gemini_models(api_key or '')
        elif provider == 'anthropic':
            models = self.fetch_anthropic_models(api_key or '')
        elif provider == 'ollama':
            models = self.fetch_ollama_models(payload.base_url)
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Provider model loading is not supported',
            )

        if not models:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='No available models were returned for this provider',
            )

        return LLMAvailableModelsResponse(provider=provider, models=models)

    def create_integration(
        self,
        current_user: User,
        payload: LLMIntegrationCreateRequest,
        request_id: str,
    ) -> LLMIntegrationMutationResponse:
        self.ensure_manager(current_user)
        provider = self.normalize_provider(payload.provider)
        if provider != 'ollama' and payload.base_url:
            raise DomainError(422, 'invalid_base_url', 'Custom base URL is supported only for Ollama')
        account_name = self.normalize_account_name(payload.account_name)
        api_key = self.normalize_api_key(payload.api_key, required=provider != 'ollama')
        policy_name = ''
        models = self.normalize_models(payload.models)
        prices = self.validate_prices(payload.model_prices, models)
        self.ensure_unique_account_name(current_user, provider, account_name)

        current_time = now_utc()
        integration = LLMIntegration(
            id='',
            company=current_user.company,
            provider=provider,
            account_name=account_name,
            api_key=api_key or '',
            policy_name=policy_name,
            models=models,
            created_at=current_time,
            updated_at=current_time,
            system_prompt=payload.system_prompt,
            base_url=self.validate_ollama_url(payload.base_url) if provider == 'ollama' else None,
            model_prices=prices,
        )

        def operation(db, session):
            try:
                self.integration_repository.create(integration, session=session)
            except DuplicateKeyError as exc:
                raise DomainError(409, 'duplicate_integration', 'An integration with this provider and account name already exists') from exc
            audit(db, session, current_user, 'integration.created', 'integration',
                  self.integration_repository._object_id(integration.id), request_id,
                  after={'provider': provider, 'account_name': account_name})
        transaction(current_user, operation)

        return LLMIntegrationMutationResponse(
            integration=self.to_read(integration),
            message='LLM integration created successfully.',
        )

    def update_integration(
        self,
        current_user: User,
        integration_id: str,
        payload: LLMIntegrationUpdateRequest,
        request_id: str,
    ) -> LLMIntegrationMutationResponse:
        self.ensure_manager(current_user)
        integration = self.integration_repository.find_by_id(integration_id, current_user.company.id)
        if integration is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Integration not found')
        if integration.version != payload.version:
            raise DomainError(409, 'stale_version', 'Integration changed. Refresh and try again.')

        provider = self.normalize_provider(payload.provider)
        if provider != 'ollama' and payload.base_url:
            raise DomainError(422, 'invalid_base_url', 'Custom base URL is supported only for Ollama')
        if provider != integration.provider:
            raise DomainError(422, 'immutable_provider', 'Create a new integration to change provider')
        account_name = self.normalize_account_name(payload.account_name)
        policy_name = integration.policy_name
        models = self.normalize_models(payload.models)
        prices = self.validate_prices(payload.model_prices, models)
        api_key = self.normalize_api_key(payload.api_key, required=False)
        self.ensure_unique_account_name(
            current_user,
            provider,
            account_name,
            exclude_integration_id=integration.id,
        )

        integration.provider = provider
        integration.account_name = account_name
        integration.policy_name = policy_name
        integration.models = models
        integration.model_prices = prices
        integration.system_prompt = payload.system_prompt
        integration.base_url = self.validate_ollama_url(payload.base_url) if provider == 'ollama' else None
        if api_key is not None:
            integration.api_key = api_key
        integration.updated_at = now_utc()
        integration.version += 1

        def operation(db, session):
            current = db.integrations.find_one({'_id': self.integration_repository._object_id(integration.id),
                                                'company_id': company_id(current_user)}, session=session)
            if current is None:
                raise DomainError(404, 'not_found', 'Integration not found')
            if current.get('version', 1) != payload.version:
                raise DomainError(409, 'stale_version', 'Integration changed. Refresh and try again.')
            try:
                self.integration_repository.save(integration, expected_version=payload.version, session=session)
            except DuplicateKeyError as exc:
                raise DomainError(409, 'duplicate_integration', 'An integration with this provider and account name already exists') from exc
            audit(db, session, current_user, 'integration.updated', 'integration', current['_id'], request_id,
                  before={'provider': current['provider'], 'account_name': current['account_name'], 'version': payload.version},
                  after={'provider': provider, 'account_name': account_name, 'version': integration.version})
        transaction(current_user, operation)

        return LLMIntegrationMutationResponse(
            integration=self.to_read(integration),
            message='LLM integration updated successfully.',
        )

    @staticmethod
    def validate_prices(prices, models):
        result = []
        seen = set()
        for item in prices:
            if item.model not in models or item.model in seen:
                raise DomainError(422, 'invalid_model_price', 'Each price must refer to one enabled model only')
            seen.add(item.model)
            result.append({**item.model_dump(exclude={'effective_at'}), 'effective_at': now_utc()})
        return result
