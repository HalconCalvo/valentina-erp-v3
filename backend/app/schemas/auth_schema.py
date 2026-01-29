from typing import Optional
from pydantic import BaseModel

# 1. Esquema simple para los datos del usuario en el login
class UserLoginResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str

# 2. Esquema del Token (Esto es lo que faltaba)
class Token(BaseModel):
    access_token: str
    token_type: str
    user: Optional[UserLoginResponse] = None # Agregamos esto para el frontend

# 3. Esquema para decodificar el token (Payload)
class TokenPayload(BaseModel):
    sub: Optional[int] = None