from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException

from app.models.prompt_run import PromptRun


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class PromptRunRepository:
    def __init__(self, database):
        self.collection = database.prompt_runs

    @staticmethod
    def _object_id(value: str) -> ObjectId:
        if not ObjectId.is_valid(value):
            raise HTTPException(status_code=422, detail='Invalid resource ID')
        return ObjectId(value)

    @staticmethod
    def _sort_key(run: PromptRun) -> tuple[datetime, str]:
        return (run.created_at, run.id)

    def _to_document(self, run: PromptRun) -> dict:
        return {
            'company_id': self._object_id(run.company_id),
            'user_id': self._object_id(run.user_id),
            'user_name': run.user_name,
            'user_email': run.user_email,
            'integration_id': self._object_id(run.integration_id),
            'integration_account_name': run.integration_account_name,
            'provider': run.provider,
            'model': run.model,
            'prompt': run.prompt,
            'system_prompt': run.system_prompt,
            'response_text': run.response_text,
            'selected_groups': list(run.selected_groups),
            'policy_name': run.policy_name,
            'status': run.status,
            'error_message': run.error_message,
            'latency_ms': run.latency_ms,
            'prompt_tokens': run.prompt_tokens,
            'completion_tokens': run.completion_tokens,
            'total_tokens': run.total_tokens,
            'created_at': run.created_at,
        }

    def _to_model(self, document: dict | None) -> PromptRun | None:
        if document is None:
            return None

        return PromptRun(
            id=str(document['_id']),
            company_id=str(document['company_id']),
            user_id=str(document['user_id']),
            user_name=document.get('user_name', ''),
            user_email=document.get('user_email', ''),
            integration_id=str(document['integration_id']),
            integration_account_name=document.get('integration_account_name', ''),
            provider=document.get('provider', ''),
            model=document.get('model', ''),
            prompt=document.get('prompt', ''),
            system_prompt=document.get('system_prompt', ''),
            response_text=document.get('response_text', ''),
            selected_groups=list(document.get('selected_groups', [])),
            policy_name=document.get('policy_name', ''),
            status=document.get('status', 'completed'),
            error_message=document.get('error_message'),
            latency_ms=document.get('latency_ms'),
            prompt_tokens=document.get('prompt_tokens'),
            completion_tokens=document.get('completion_tokens'),
            total_tokens=document.get('total_tokens'),
            created_at=_ensure_utc(document.get('created_at')) or datetime.now(timezone.utc),
        )

    def _sorted_runs(self, documents, limit: int) -> list[PromptRun]:
        runs = [self._to_model(document) for document in documents]
        valid_runs = [run for run in runs if run is not None]
        ordered = sorted(valid_runs, key=self._sort_key, reverse=True)
        return ordered[:limit]

    def list_by_company_id(self, company_id: str, limit: int = 20) -> list[PromptRun]:
        documents = self.collection.find({'company_id': self._object_id(company_id)}).sort([('created_at', -1), ('_id', -1)]).limit(limit)
        return [self._to_model(document) for document in documents]

    def list_by_user_id(self, company_id: str, user_id: str, limit: int = 20) -> list[PromptRun]:
        documents = self.collection.find({'company_id': self._object_id(company_id),
                                          'user_id': self._object_id(user_id)}).sort([('created_at', -1), ('_id', -1)]).limit(limit)
        return [self._to_model(document) for document in documents]

    def create(self, run: PromptRun) -> PromptRun:
        result = self.collection.insert_one(self._to_document(run))
        run.id = str(result.inserted_id)
        return run
