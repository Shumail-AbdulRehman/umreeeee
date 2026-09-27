from fastapi import HTTPException

ADMIN_ROLES = frozenset({'org_admin', 'super_admin'})
ROLES = frozenset({'org_admin', 'user', 'super_admin'})


def require_admin(user) -> None:
    if user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail='Organization administrator access required')


def require_super_admin(user) -> None:
    if user.role != 'super_admin':
        raise HTTPException(status_code=403, detail='Platform administrator access required')
