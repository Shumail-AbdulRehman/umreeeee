import os
from uuid import uuid4

import pytest
from pymongo import MongoClient

from app.core.config import MONGODB_DB_NAME


@pytest.fixture
def test_database():
    url = os.getenv('TEST_MONGODB_URL')
    base_name = os.getenv('TEST_MONGODB_DB_NAME', '')
    if not url:
        pytest.skip('TEST_MONGODB_URL not configured')
    if not base_name.startswith('test_') or base_name == MONGODB_DB_NAME:
        pytest.fail('TEST_MONGODB_DB_NAME must start with test_ and differ from the app database')
    name = f'{base_name}_{uuid4().hex}'
    client = MongoClient(url, tz_aware=True, serverSelectionTimeoutMS=2000)
    database = client[name]
    client.admin.command('ping')
    with client.start_session() as session:
        with session.start_transaction():
            database.companies.find_one({}, session=session)
    yield database
    client.drop_database(name)
    client.close()
