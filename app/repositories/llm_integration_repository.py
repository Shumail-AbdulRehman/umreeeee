from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from app.core.encryption import decrypt_credential, encrypt_credential

from app.models.llm_integration import LLMIntegration
from app.repositories.company_repository import CompanyRepository


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class LLMIntegrationRepository:
    def __init__(self, database, company_repository: CompanyRepository):
        self.collection = database.integrations
        self.company_repository = company_repository

    @staticmethod
    def _object_id(value: str) -> ObjectId:
        if not ObjectId.is_valid(value):
            raise HTTPException(status_code=422, detail='Invalid resource ID')
        return ObjectId(value)

    @staticmethod
    def _sort_key(integration: LLMIntegration) -> tuple[str, str]:
        return (integration.provider.lower(), integration.account_name.lower())

    def _to_document(self, integration: LLMIntegration) -> dict:
        return {
            'company_id': self._object_id(integration.company.id),
            'provider': integration.provider,
            'account_name': integration.account_name,
            'api_key_ciphertext': encrypt_credential(integration.api_key) if integration.api_key else None,
            'api_key_key_id': 'v1' if integration.api_key else None,
            'api_key_suffix': integration.api_key[-4:] if integration.api_key else None,
            'policy_name': integration.policy_name,
            'status': integration.status,
            'version': integration.version,
            'system_prompt': integration.system_prompt,
            'base_url': integration.base_url,
            'account_name_normalized': integration.account_name.casefold(),
            'models': integration.models,
            'model_prices': integration.model_prices,
            'created_at': integration.created_at,
            'updated_at': integration.updated_at,
        }

    def _to_model(self, document: dict | None, *, include_credential: bool = False) -> LLMIntegration | None:
        if document is None:
            return None

        company = self.company_repository.find_by_id(str(document['company_id']))
        if company is None:
            raise RuntimeError('Integration references a missing company document')

        return LLMIntegration(
            id=str(document['_id']),
            company=company,
            provider=document['provider'],
            account_name=document['account_name'],
            api_key=decrypt_credential(document['api_key_ciphertext']) if include_credential and document.get('api_key_ciphertext') else '',
            policy_name=document.get('policy_name', ''),
            models=list(document.get('models', [])),
            created_at=_ensure_utc(document['created_at']),
            updated_at=_ensure_utc(document['updated_at']),
            status=document.get('status', 'active'),
            version=document.get('version', 1),
            system_prompt=document.get('system_prompt', ''),
            base_url=document.get('base_url'),
            has_api_key=bool(document.get('api_key_ciphertext')),
            api_key_suffix=document.get('api_key_suffix'),
            model_prices=list(document.get('model_prices', [])),
        )

    def find_by_id(self, integration_id: str, company_id: str | None = None,
                   *, include_credential: bool = False) -> LLMIntegration | None:
        query = {'_id': self._object_id(integration_id)}
        if company_id is not None:
            query['company_id'] = self._object_id(company_id)
        return self._to_model(self.collection.find_one(query), include_credential=include_credential)

    def find_by_company_provider_account_name(
        self,
        company_id: str,
        provider: str,
        account_name: str,
    ) -> LLMIntegration | None:
        return self._to_model(
            self.collection.find_one(
                {
                    'company_id': self._object_id(company_id),
                    'provider': provider,
                    'account_name_normalized': account_name.casefold(),
                }
            )
        )

    def list_by_company_id(self, company_id: str) -> list[LLMIntegration]:
        documents = self.collection.find({'company_id': self._object_id(company_id)})
        integrations = [self._to_model(document) for document in documents]
        return sorted(
            [integration for integration in integrations if integration is not None],
            key=self._sort_key,
        )

    def create(self, integration: LLMIntegration, *, session=None) -> LLMIntegration:
        result = self.collection.insert_one(self._to_document(integration), session=session)
        integration.id = str(result.inserted_id)
        return integration

    def save(self, integration: LLMIntegration, *, expected_version=None, session=None) -> LLMIntegration:
        query = {'_id': self._object_id(integration.id), 'company_id': self._object_id(integration.company.id)}
        if expected_version is not None:
            query['version'] = expected_version
        changes = self._to_document(integration)
        if not integration.api_key:
            for field in ['api_key_ciphertext', 'api_key_key_id', 'api_key_suffix']:
                changes.pop(field, None)
        result = self.collection.update_one(
            query,
            {'$set': changes},
            session=session,
        )
        if result.matched_count != 1:
            raise HTTPException(status_code=409, detail='Integration changed. Refresh and try again.')
        return integration
