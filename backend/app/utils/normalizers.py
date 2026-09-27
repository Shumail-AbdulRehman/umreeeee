import re

from fastapi import HTTPException, status


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> None:
    if '@' not in email or '.' not in email.split('@')[-1]:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Enter a valid email address')


def normalize_company_name(company_name: str) -> str:
    return ' '.join(company_name.strip().split())


def normalize_person_name(name: str) -> str:
    return ' '.join(name.strip().split())


def normalize_department_name(name: str) -> str:
    return ' '.join(name.strip().split())


def normalize_role_name(name: str) -> str:
    return ' '.join(name.strip().split())


def slugify_company(company_name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '-', company_name.lower()).strip('-')
    if not slug:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Enter a valid company name')
    return slug
