from app.db.mongo import get_database
from app.queue.recovery import recover


if __name__ == '__main__':
    print(recover(get_database()))
