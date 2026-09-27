from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.health import router as health_router
from app.api.routes.integrations import router as integrations_router
from app.api.routes.prompts import router as prompts_router
from app.api.routes.users import router as users_router
from app.api.routes.administration import router as administration_router
from app.api.routes.observability import router as observability_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.red_team import router as red_team_router


api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(integrations_router)
api_router.include_router(prompts_router)
api_router.include_router(users_router)
api_router.include_router(administration_router)
api_router.include_router(observability_router)
api_router.include_router(analytics_router)
api_router.include_router(red_team_router)
