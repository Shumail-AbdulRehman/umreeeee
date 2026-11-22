"""Read-only connection/transaction check using this dyno's actual configuration.

Run: python -m scripts.check_database
No URI, credentials, application records or driver exception messages are printed.
"""
import logging

from app.db.diagnostics import database_phase
from app.db.mongo import close_mongo_client, get_mongo_client, verify_transactions


def main():
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    try:
        with database_phase('manual_connection'):
            get_mongo_client()
        with database_phase('manual_transactions'):
            verify_transactions()
    except Exception:
        return 1
    finally:
        close_mongo_client()
    print('Database connection and read-only transaction passed. No indexes or records were changed.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
