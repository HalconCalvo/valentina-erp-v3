from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel

# 0. Enum de Roles (Definición Central de Seguridad)
class UserRole(str, Enum):
    DIRECTOR = "DIRECTOR"       # Acceso Total (Dios)
    GERENCIA = "GERENCIA"       # Gerencia Operativa / Flujo Maestro (Tu Esposa)
    ADMIN = "ADMIN"             # Finanzas / Contabilidad (El Maker)
    SALES = "SALES"             # Ventas
    DESIGN = "DESIGN"           # Diseño e Ingeniería
    WAREHOUSE = "WAREHOUSE"     # Almacenista
    PRODUCTION = "PRODUCTION"   # Jefe de Producción
    LOGISTICS = "LOGISTICS"     # Logística e Instalación

# 1. Update: Lo que recibimos al editar (Todo opcional)
class UserUpdate(SQLModel):
    email: str | None = None
    full_name: str | None = None
    role: UserRole | None = None 
    password: str | None = None 
    is_active: bool | None = None
    commission_rate: float | None = None 
    monthly_sales_target: float | None = None
    monthly_quota: float | None = None  # Meta mensual (V5); editable solo ADMIN/DIRECTOR
    global_commission_rate: float | None = None

# 2. Base (Atributos compartidos)
class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: str | None = None
    is_active: bool = True
    role: UserRole = Field(default=UserRole.SALES) 
    commission_rate: float = Field(default=0.0)
    monthly_sales_target: float = Field(default=0.0)
    monthly_quota: float | None = Field(default=None)  # Meta mensual explícita (V5)
    global_commission_rate: float = Field(default=0.0)

# 3. Tabla de Base de Datos (Lo que se guarda)
class User(UserBase, table=True):
    __tablename__ = "users"
    id: int | None = Field(default=None, primary_key=True)
    hashed_password: str
    is_superuser: bool = Field(default=False)

# 4. Creación (Input del API - Incluye password plano)
class UserCreate(UserBase):
    password: str

# 5. Público (Output del API - Oculta el password)
class UserPublic(UserBase):
    id: int
    commission_rate: float | None = 0.0
    monthly_sales_target: float | None = 0.0
    global_commission_rate: float | None = 0.0