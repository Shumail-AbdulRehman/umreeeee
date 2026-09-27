"""MongoDB is the only live store. Legacy app.db files are migration input only."""

from pymongo import MongoClient
from pymongo.errors import PyMongoError

from app.core.config import MONGODB_DB_NAME, MONGODB_SERVER_SELECTION_TIMEOUT_MS, MONGODB_URL

_client: MongoClient | None = None


def get_mongo_client() -> MongoClient:
    global _client
    if _client is None:
        client = MongoClient(
            MONGODB_URL,
            tz_aware=True,
            serverSelectionTimeoutMS=MONGODB_SERVER_SELECTION_TIMEOUT_MS,
            connectTimeoutMS=MONGODB_SERVER_SELECTION_TIMEOUT_MS,
        )
        try:
            client.admin.command('ping')
        except PyMongoError:
            client.close()
            raise
        _client = client
    return _client


def get_database():
    return get_mongo_client()[MONGODB_DB_NAME]


def verify_transactions() -> None:
    """Fail before serving traffic if MongoDB cannot commit a transaction."""
    client = get_mongo_client()
    try:
        with client.start_session() as session:
            with session.start_transaction():
                get_database().companies.find_one({}, session=session)
    except PyMongoError as exc:
        raise RuntimeError('MongoDB transactions require a replica set or sharded cluster.') from exc


def get_database_status() -> dict[str, str]:
    try:
        get_mongo_client().admin.command('ping')
        return {'mode': 'mongodb', 'database_name': MONGODB_DB_NAME, 'status': 'ready'}
    except PyMongoError:
        return {'mode': 'mongodb', 'database_name': MONGODB_DB_NAME, 'status': 'unavailable'}


def close_mongo_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
