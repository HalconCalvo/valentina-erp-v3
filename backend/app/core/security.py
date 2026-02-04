import bcrypt
from datetime import datetime, timedelta
from typing import Any, Union, Optional
from jose import jwt
from app.core.config import settings

ALGORITHM = "HS256"

def create_access_token(
    subject: Union[str, Any], 
    expires_delta: timedelta = None,
    user_id: Optional[int] = None,
    user_role: Optional[str] = None
) -> str:
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Payload base
    to_encode = {"exp": expire, "sub": str(subject)}
    
    # Datos extra
    if user_id:
        to_encode["user_id"] = user_id
    if user_role:
        to_encode["role"] = user_role
        
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- IMPLEMENTACIÓN NATIVA DE BCRYPT (ESTABLE) ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica el password usando bcrypt directamente."""
    # bcrypt requiere bytes, no strings
    password_bytes = plain_password.encode('utf-8')
    hash_bytes = hashed_password.encode('utf-8')
    try:
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """Genera el hash usando bcrypt directamente."""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(password_bytes, salt)
    return hashed_bytes.decode('utf-8') # Regresamos string para la BD