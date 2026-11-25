web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
worker: cd backend && python -m app.workers.red_team_worker
dispatcher: cd backend && python -m app.queue.dispatcher
recovery: cd backend && python -m app.queue.recovery
staff-invitations: cd backend && python -m app.workers.staff_invitation_worker
