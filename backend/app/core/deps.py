from typing import Generator, Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlmodel import Session

from app.core.database import engine
from app.core.config import settings
from app.models.users import User

# 1. Generador de Sesión de Base de Datos
def get_session() -> Generator[Session, None, None]:
    """
    Crea una sesión nueva por cada request y la cierra al terminar.
    """
    with Session(engine) as session:
        yield session

# Definición de la Dependencia
SessionDep = Annotated[Session, Depends(get_session)]

# 2. Configuración de OAuth2
# Esto define de dónde saca el token el Swagger UI y el backend
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)

# 3. Obtener Usuario Actual (Decodificar Token)
def get_current_user(
    session: Session = Depends(get_session),
    token: str = Depends(reusable_oauth2)
) -> User:
    try:
        # Decodificamos el token usando la LLAVE SECRETA configurada
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = payload.get("sub") # 'sub' suele guardar el ID del usuario
        
        if token_data is None:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Credenciales no válidas (Token sin sujeto)",
            )
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No se pudo validar las credenciales",
        )
    
    # Buscamos al usuario en la BD usando el ID del token
    try:
        user_id = int(token_data)
        user = session.get(User, user_id)
    except ValueError:
        # Si el token no tenía un número, fallamos
        raise HTTPException(status_code=403, detail="Token malformado")

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user

# 4. Obtener Usuario Activo (Esta es la función que sales.py estaba buscando)
def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    return current_user