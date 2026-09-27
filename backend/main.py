from dotenv import load_dotenv
import uvicorn

from app.main import app


load_dotenv()


def run() -> None:
    uvicorn.run(
        'main:app',
        host='127.0.0.1',
        port=8000,
        reload=True,
        log_level='info',
    )


if __name__ == '__main__':
    run()
