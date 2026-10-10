"""User administration. Only DIRECTOR creates users or change someone else; anyone may change their own
name, phone and password. Users are never deleted: they are deactivated with a reason (change log)."""
from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.audit_context import audit_reason
from app.core.permissions import require_roles, role_of
from app.core.security import get_password_hash
from app.models.users import User, UserCreate, UserUpdate
from app.schemas.user_schema import UserDeactivateUpdate
from app.services import active_session_service

USER_ADMIN_ROLES = {"DIRECTOR"}  # D6: only DIRECTOR creates and administers users
SELF_EDITABLE_FIELDS = {"full_name", "phone", "password"}
SUPER_ADMIN_ID = 1


def _assert_admin(user) -> None:
    require_roles(user, USER_ADMIN_ROLES, "Solo Dirección administra usuarios.")


def _get_or_404(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def create_user(session: Session, data: UserCreate, current_user) -> User:
    _assert_admin(current_user)
    if session.exec(select(User).where(User.email == data.email)).first():
        raise HTTPException(status_code=400, detail="El email ya está registrado.")
    user = User(**data.model_dump(exclude={"password"}), hashed_password=get_password_hash(data.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_user(session: Session, user_id: int, data: UserUpdate, current_user) -> User:
    changes = data.model_dump(exclude_unset=True)
    is_admin = role_of(current_user) in USER_ADMIN_ROLES
    if not is_admin and (current_user.id != user_id or set(changes) - SELF_EDITABLE_FIELDS):
        raise HTTPException(status_code=403, detail="Solo puedes cambiar tu nombre, teléfono y contraseña.")
    user = _get_or_404(session, user_id)
    password = changes.pop("password", None)
    if password:
        user.hashed_password = get_password_hash(password)
    user.sqlmodel_update(changes)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def deactivate_user(session: Session, user_id: int, data: UserDeactivateUpdate, current_user) -> User:
    _assert_admin(current_user)
    reason = (data.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="El motivo de la baja es obligatorio.")
    user = _get_or_404(session, user_id)
    if user.id in (SUPER_ADMIN_ID, current_user.id):
        raise HTTPException(status_code=400, detail="No se puede dar de baja a este usuario.")
    with audit_reason(reason):
        user.is_active = False
        session.add(user)
        session.flush()
    active_session_service.clear_active_session(session, user.id)
    session.commit()
    session.refresh(user)
    return user
