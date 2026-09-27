from fastapi import APIRouter, Depends

from app.api.dependencies.services import get_dashboard_service
from app.services.dashboard_service import DashboardService
from app.api.dependencies.auth import get_current_user
from app.models.user import User


router = APIRouter(prefix='/api/dashboard', tags=['dashboard'])


@router.get('')
def dashboard(
    current_user: User = Depends(get_current_user),
    dashboard_service: DashboardService = Depends(get_dashboard_service),
) -> dict:
    return dashboard_service.get_dashboard_data(current_user)
