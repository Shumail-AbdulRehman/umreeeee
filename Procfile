web: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
worker: python -m app.workers.red_team_worker
dispatcher: python -m app.queue.dispatcher
