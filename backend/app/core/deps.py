from typing import Generator, Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlmodel import Session, select

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

# Definición de la Dependencia de Sesión
SessionDep = Annotated[Session, Depends(get_session)]

# 2. Configuración de OAuth2
reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)

# 3. Obtener Usuario Actual (Base)
def get_current_user(
    session: Session = Depends(get_session),
    token: str = Depends(reusable_oauth2)
) -> User:
    try:
        # Decodificamos el token
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        
        # Intentamos obtener el ID numérico directo
        token_user_id = payload.get("user_id")
        # El 'sub' suele ser el email
        token_sub = payload.get("sub")
        
        if token_user_id is None and token_sub is None:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Credenciales no válidas (Token vacío)",
            )
            
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No se pudo validar las credenciales",
        )
    
    # BÚSQUEDA DEL USUARIO
    user = None
    
    # Estrategia A: Buscar por ID (Más rápido)
    if token_user_id:
        user = session.get(User, token_user_id)
    
    # Estrategia B: Si falló A, buscar por Email (sub)
    if not user and token_sub:
        if isinstance(token_sub, str) and "@" in token_sub:
            user = session.exec(select(User).where(User.email == token_sub)).first()
        else:
            try:
                user_id = int(token_sub)
                user = session.get(User, user_id)
            except ValueError:
                pass

    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
        
    return user

# 4. Obtener Usuario Activo
def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    return current_user

# 5. EL ALIAS QUE FALTABA (CurrentUser)
# Esto es lo que busca finance.py
CurrentUser = Annotated[User, Depends(get_current_active_user)]