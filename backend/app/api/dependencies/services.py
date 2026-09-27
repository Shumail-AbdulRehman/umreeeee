from app.db.mongo import get_database
from app.repositories.llm_integration_repository import LLMIntegrationRepository
from app.repositories.company_repository import CompanyRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.services.dashboard_service import DashboardService
from app.services.llm_integration_service import LLMIntegrationService
from app.services.user_management_service import UserManagementService


def get_company_repository() -> CompanyRepository:
    return CompanyRepository(get_database())


def get_user_repository() -> UserRepository:
    database = get_database()
    company_repository = CompanyRepository(database)
    return UserRepository(database, company_repository)


def get_auth_service() -> AuthService:
    database = get_database()
    company_repository = CompanyRepository(database)
    user_repository = UserRepository(database, company_repository)
    return AuthService(user_repository, company_repository)


def get_dashboard_service() -> DashboardService:
    return DashboardService()


def get_user_management_service() -> UserManagementService:
    database = get_database()
    company_repository = CompanyRepository(database)
    user_repository = UserRepository(database, company_repository)
    return UserManagementService(user_repository)


def get_llm_integration_service() -> LLMIntegrationService:
    database = get_database()
    company_repository = CompanyRepository(database)
    integration_repository = LLMIntegrationRepository(database, company_repository)
    return LLMIntegrationService(integration_repository)
