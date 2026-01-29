from datetime import timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, SQLModel, select 

# --- IMPORTACIONES ---
from app.core import security
from app.core.config import settings
from app.core.database import get_session 
from app.models.users import User

# Nota: Eliminamos el import externo de Token para evitar conflictos
# from app.schemas.auth_schema import Token 

router = APIRouter()

# --- 1. DEFINIMOS EL ESQUEMA DE RESPUESTA AQUÍ MISMO ---
# Esto garantiza que FastAPI sepa qué campos devolver al frontend
class TokenResponse(SQLModel):
    access_token: str
    token_type: str
    # Campos extra para el frontend:
    user_id: int
    role: str
    full_name: str
    email: str

# --- HELPER FUNCTION LOCAL ---
def authenticate_user(db: Session, email: str, password: str):
    """Busca al usuario y verifica su password"""
    # Usamos sintaxis compatible con SQLModel (select)
    statement = select(User).where(User.email == email)
    user = db.exec(statement).first()
    
    if not user:
        return None
    if not security.verify_password(password, user.hashed_password):
        return None
    return user

# --- ENDPOINT DE LOGIN ---
# IMPORTANTE: La ruta debe coincidir con la del frontend (/login/access-token)
@router.post("/access-token", response_model=TokenResponse)
def login_access_token(
    db: Session = Depends(get_session),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    # 1. Autenticar
    user = authenticate_user(db, email=form_data.username, password=form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")

    # 2. Definir expiración
    # Si settings.ACCESS_TOKEN_EXPIRE_MINUTES falla, usa 720 (12 horas)
    expire_minutes = getattr(settings, 'ACCESS_TOKEN_EXPIRE_MINUTES', 720)
    access_token_expires = timedelta(minutes=expire_minutes)
    
    # 3. Crear Token y Retornar datos PLANOS
    # Esto coincide exactamente con lo que espera LoginPage.tsx
    return {
        "access_token": security.create_access_token(
            subject=user.id, 
            expires_delta=access_token_expires
        ),
        "token_type": "bearer",
        
        # DATOS PLANOS (Sin anidar en "user")
        "user_id": user.id,
        "role": user.role,
        "full_name": user.full_name,
        "email": user.email
    }