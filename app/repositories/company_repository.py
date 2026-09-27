from datetime import datetime, timezone

from bson import ObjectId

from app.models.company import Company


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class CompanyRepository:
    def __init__(self, database):
        self.collection = database.companies

    @staticmethod
    def _to_model(document: dict | None) -> Company | None:
        if document is None:
            return None
        return Company(
            id=str(document['_id']),
            name=document['name'],
            slug=document['slug'],
            created_at=_ensure_utc(document['created_at']),
            status=document.get('status', 'active'),
            version=document.get('version', 1),
        )

    def find_by_id(self, company_id: str) -> Company | None:
        return self._to_model(self.collection.find_one({'_id': ObjectId(company_id)}))

    def find_by_slug(self, slug: str) -> Company | None:
        return self._to_model(self.collection.find_one({'slug': slug}))

    def create(self, name: str, slug: str, *, session=None) -> Company:
        created_at = datetime.now(timezone.utc)
        result = self.collection.insert_one(
            {
                'name': name,
                'slug': slug,
                'created_at': created_at,
                'status': 'active',
                'version': 1,
                'administration_revision': 0,
                'settings': {'content_retention_days': 7, 'require_active_policy': True},
                'updated_at': created_at,
            }, session=session
        )
        return Company(
            id=str(result.inserted_id),
            name=name,
            slug=slug,
            created_at=created_at,
            status='active',
            version=1,
        )
