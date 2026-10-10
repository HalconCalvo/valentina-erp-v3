from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

# 1. Importaciones de Core
from app.core.database import get_session
# --- IMPORTANTE: Necesitamos esto para identificar al usuario logueado ---
from app.core.deps import get_current_active_user 

# 2. Importaciones de tus Modelos
from app.models.users import User, UserCreate, UserUpdate, UserPublic
from app.schemas.user_schema import UserDeactivateUpdate
from app.services import active_session_service, user_service

router = APIRouter()

# --- ENDPOINTS ---

# ==========================================
# 0. MI PERFIL (El que faltaba)
# ==========================================
@router.get("/me", response_model=UserPublic)
def read_user_me(
    current_user: User = Depends(get_current_active_user),
) -> Any:
    return current_user


@router.post("/heartbeat")
def post_user_heartbeat(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    active_session_service.touch_heartbeat(session, current_user.id)
    return {"ok": True}


@router.post("/logout")
def post_user_logout(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    active_session_service.clear_active_session(session, current_user.id)
    return {"ok": True}

# ==========================================
# 1. LISTAR (GET)
# ==========================================
@router.get("/", response_model=List[UserPublic])
def read_users(
    session: Session = Depends(get_session),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user), # Seguridad opcional: Solo usuarios activos pueden listar
) -> Any:
    # Opcional: Validar si es admin
    # if current_user.role != "ADMIN": raise HTTPException(400, "No tienes permiso")
    
    users = session.exec(select(User).offset(skip).limit(limit)).all()
    return users

# ==========================================
# 2. CREAR (POST) — solo DIRECTOR / ADMIN
# ==========================================
@router.post("/", response_model=UserPublic)
def create_user(
    user_in: UserCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    return user_service.create_user(session, user_in, current_user)

# ==========================================
# 3. ACTUALIZAR (PUT) — DIRECTOR / ADMIN; cada quien su nombre, teléfono y contraseña
# ==========================================
@router.put("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    return user_service.update_user(session, user_id, user_in, current_user)

# ==========================================
# 4. DAR DE BAJA (nunca se elimina) — DIRECTOR / ADMIN, con motivo
# ==========================================
@router.patch("/{user_id}/deactivate", response_model=UserPublic)
def deactivate_user(
    user_id: int,
    data: UserDeactivateUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    return user_service.deactivate_user(session, user_id, data, current_user)
