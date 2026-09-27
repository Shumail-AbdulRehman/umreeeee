"""Import the two supplied catalogs into an explicitly selected database."""
import argparse
import sys
from pathlib import Path

from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.policy_catalog import import_catalogs, read_catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uri', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--dlp', required=True)
    parser.add_argument('--guardrail', required=True)
    args = parser.parse_args()
    catalogs = {kind: read_catalog(getattr(args, kind), kind) for kind in ('dlp', 'guardrail')}
    with MongoClient(args.uri, serverSelectionTimeoutMS=5000) as client:
        db = client[args.database]
        db.policies.create_index([('company_id', 1), ('category', 1)], unique=True,
            partialFilterExpression={'managed_catalog': True}, name='managed_policy_kind_unique')
        with client.start_session() as session:
            session.with_transaction(lambda session: import_catalogs(db, catalogs, session))
        print({kind: value['entry_count'] for kind, value in catalogs.items()})
        print('Organizations:', db.companies.count_documents({}))


if __name__ == '__main__':
    main()
