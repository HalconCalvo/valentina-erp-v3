from typing import Optional
from sqlmodel import SQLModel

# ==========================================
# MODELOS DE AUTENTICACIÓN (Tokens)
# ==========================================
# Nota: Los Roles y la tabla User viven en 'users.py'.
# Aquí solo definimos los boletos de entrada (Tokens).

class Token(SQLModel):
    access_token: str
    token_type: str

class TokenPayload(SQLModel):
    sub: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = None