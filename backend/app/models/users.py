from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel

# 0. Enum de Roles (Definición Central de Seguridad)
class UserRole(str, Enum):
    DIRECTOR = "DIRECTOR"       # Acceso Total (Dios)
    ADMIN = "ADMIN"             # Finanzas / Contabilidad
    SALES = "SALES"             # Ventas
    DESIGN = "DESIGN"           # Diseño e Ingeniería
    WAREHOUSE = "WAREHOUSE"     # Almacenista
    PRODUCTION = "PRODUCTION"   # Jefe de Producción (Nuevo)

# 1. Update: Lo que recibimos al editar (Todo opcional)
class UserUpdate(SQLModel):
    email: str | None = None
    full_name: str | None = None
    role: UserRole | None = None 
    password: str | None = None 
    is_active: bool | None = None
    commission_rate: float | None = None 

# 2. Base (Atributos compartidos)
class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: str | None = None
    is_active: bool = True
    role: UserRole = Field(default=UserRole.SALES) 
    commission_rate: float = Field(default=0.0)

# 3. Tabla de Base de Datos (Lo que se guarda)
class User(UserBase, table=True):
    __tablename__ = "users"
    id: int | None = Field(default=None, primary_key=True)
    hashed_password: str

# 4. Creación (Input del API - Incluye password plano)
class UserCreate(UserBase):
    password: str

# 5. Público (Output del API - Oculta el password)
class UserPublic(UserBase):
    id: int