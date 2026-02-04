from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

# 1. Importaciones de Core
from app.core.database import get_session
from app.core.security import get_password_hash
# --- IMPORTANTE: Necesitamos esto para identificar al usuario logueado ---
from app.core.deps import get_current_active_user 

# 2. Importaciones de tus Modelos
from app.models.users import User, UserCreate, UserUpdate, UserPublic

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
# 2. CREAR (POST)
# ==========================================
@router.post("/", response_model=UserPublic)
def create_user(
    user_in: UserCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user) # Descomentar para proteger creación
) -> Any:
    # Validar si existe
    user_exists = session.exec(select(User).where(User.email == user_in.email)).first()
    if user_exists:
        raise HTTPException(status_code=400, detail="El email ya está registrado.")
    
    # Hashear password
    hashed_pw = get_password_hash(user_in.password)
    
    # Crear objeto (excluyendo el password plano)
    extra_data = user_in.model_dump(exclude={"password"})
    
    user = User(
        **extra_data, 
        hashed_password=hashed_pw
    )
    
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

# ==========================================
# 3. ACTUALIZAR (PUT)
# ==========================================
@router.put("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int, 
    user_in: UserUpdate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    # Seguridad básica: Solo Admin puede editar otros, o uno mismo
    # if current_user.role != "ADMIN" and current_user.id != user_id:
    #     raise HTTPException(400, "No tienes permiso")

    user_db = session.get(User, user_id)
    if not user_db:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Limpiar datos vacíos
    update_data = user_in.model_dump(exclude_unset=True)

    # Si viene password, hashear y reemplazar
    if "password" in update_data:
        password = update_data.pop("password")
        if password: 
            user_db.hashed_password = get_password_hash(password)

    # Actualizar campos restantes
    user_db.sqlmodel_update(update_data)

    session.add(user_db)
    session.commit()
    session.refresh(user_db)
    return user_db

# ==========================================
# 4. ELIMINAR (DELETE)
# ==========================================
@router.delete("/{user_id}")
def delete_user(
    user_id: int, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
) -> Any:
    # Seguridad: Solo Admin
    # if current_user.role != "ADMIN": raise HTTPException(400, "No tienes permiso")

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Protección de seguridad para el Admin Principal (ID 1)
    if user.id == 1:
        raise HTTPException(status_code=400, detail="No se puede eliminar al Super Administrador.")
    
    session.delete(user)
    session.commit()
    return {"ok": True}