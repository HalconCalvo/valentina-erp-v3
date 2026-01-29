from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session

# 1. CORE
from app.core import security
from app.core.database import get_session

# 2. MODELS (Aquí vive el Usuario)
from app.models.users import User

# 3. SCHEMAS (Aquí vive el Token - IMPORTANTE: CORREGIDO)
from app.schemas.auth_schema import Token

router = APIRouter()

@router.post("/login", response_model=Token)
def login_access_token(
    db: Session = Depends(get_session), 
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    # Buscar usuario
    user = db.query(User).filter(User.email == form_data.username).first()
    
    # Validar
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Crear token
    return {
        "access_token": security.create_access_token(user.id),
        "token_type": "bearer",
        # Nota: auth.py suele ser el endpoint legacy. 
        # Nuestro endpoint principal ahora es login.py, 
        # pero mantenemos este para que no rompa importaciones viejas.
    }