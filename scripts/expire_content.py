from app.db.mongo import get_database
from app.services.content_service import expire_content

if __name__ == '__main__':
    print({'expired_records': expire_content(get_database())})
