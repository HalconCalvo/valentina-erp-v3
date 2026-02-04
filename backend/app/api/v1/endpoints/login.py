from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from pydantic import BaseModel  # <--- 1. IMPORTAR ESTO

from app.core.config import settings
from app.core.database import get_session
from app.core.security import create_access_token, get_password_hash, verify_password
# from app.models.auth import Token  <--- YA NO USAREMOS ESTE MODELO SIMPLE
from app.models.users import User, UserRole  

router = APIRouter()

# --- 2. DEFINIR EL NUEVO MODELO DE RESPUESTA ---
# Esto le dice al Frontend: "Te voy a dar el token Y ADEMÁS tus datos"
class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    role: str
    full_name: str
    email: str

@router.post("/access-token", response_model=TokenResponse) # <--- 3. USAR EL NUEVO MODELO
def login_access_token(
    session: Session = Depends(get_session), 
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login.
    Devuelve token + datos del usuario (rol, nombre) para actualizar el Frontend.
    """
    # 1. Buscar usuario por email
    try:
        user = session.exec(
            select(User).where(User.email == form_data.username)
        ).first()
    except Exception as e:
        print(f"Error DB en Login: {e}")
        raise HTTPException(status_code=500, detail="Error de conexión con base de datos")

    # 2. Validar credenciales
    if not user:
        raise HTTPException(status_code=400, detail="Email o contraseña incorrectos")
        
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Email o contraseña incorrectos")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")

    # 3. Crear token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Obtener string del rol (Manejo seguro de Enum)
    role_str = user.role.value if hasattr(user.role, 'value') else str(user.role)

    # 4. RETORNAR PAQUETE COMPLETO
    return {
        "access_token": create_access_token(
            subject=user.email, expires_delta=access_token_expires,
            user_id=user.id,
            user_role=role_str
        ),
        "token_type": "bearer",
        # Datos extra para que el Frontend actualice el menú lateral
        "user_id": user.id,
        "role": role_str,
        "full_name": user.full_name,
        "email": user.email
    }

# ==========================================
# 🚑 RUTA DE EMERGENCIA (ASCENSO A DIRECTOR)
# ==========================================
# @router.get("/rescue/create-admin")
# def create_rescue_admin(session: Session = Depends(get_session)):
#    """
#    Crea o actualiza al usuario admin@valentina.com con rol de DIRECTOR.
#    """
#    email = "admin@valentina.com"
#    password = "admin123" 
    
#    existing_user = session.exec(select(User).where(User.email == email)).first()
    
#    try:
#        if existing_user:
#            existing_user.hashed_password = get_password_hash(password)
#            existing_user.is_active = True
#            existing_user.role = UserRole.DIRECTOR 
#            session.add(existing_user)
#            session.commit()
#            return {"success": True, "message": f"Usuario actualizado. Rol: DIRECTOR. Pass: {password}"}
        
#        else:
#            admin_user = User(
#                email=email,
#                hashed_password=get_password_hash(password),
#                full_name="Director General",
#                role=UserRole.DIRECTOR,
#                is_active=True
#            )
#            session.add(admin_user)
#            session.commit()
#            return {"success": True, "message": f"Usuario CREADO como DIRECTOR: {password}"}
            
#    except Exception as e:
#        return {"success": False, "error": str(e)}