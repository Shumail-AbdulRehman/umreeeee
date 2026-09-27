from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import CORS_ORIGINS
from app.core.errors import install_error_handlers
from app.core.encryption import validate_encryption_key
from app.services.content_service import cipher
from app.validators.registry import registry
from scripts.reconcile_interrupted_runs import reconcile
from app.queue.recovery import recover as recover_red_team
from app.db.indexes import ensure_indexes
from app.db.mongo import close_mongo_client, get_database, verify_transactions
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_encryption_key()
    cipher()
    registry.warm_local_models()
    try:
        verify_transactions()
        ensure_indexes(get_database())
        reconcile(get_database())
        recover_red_team(get_database())
    except PyMongoError:
        logger.warning('MongoDB unavailable at startup; readiness will remain unavailable')
    try:
        from app.queue.rabbit import RabbitPublisher
        broker = RabbitPublisher()
        broker.close()
    except Exception:
        logger.info('RabbitMQ not available at startup; red-team dispatch remains pending')
    yield
    close_mongo_client()


def create_application() -> FastAPI:
    app = FastAPI(title='Sentinel AI API', lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS or ['*'],
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )
    install_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_application()
