from typing import Optional
from enum import Enum
from sqlmodel import SQLModel, Field
from datetime import datetime

# ==========================================
# 1. ENUM DE ROLES (Jerarquía de Poder)
# ==========================================
class UserRole(str, Enum):
    ADMIN = "ADMIN"           # Dios del Sistema (Config, Usuarios, Borrado físico)
    DIRECTOR = "DIRECTOR"     # Visión Financiera (Autoriza márgenes, ve costos reales)
    SALES = "SALES"           # Ceguera Operativa (Solo ve precios de venta y catálogo)
    DESIGN = "DESIGN"         # Ingeniería (Crea recetas, ve cantidades, no ve costos)
    PRODUCTION = "PRODUCTION" # Fábrica (Ve Lotes, semáforos y rutas)
    INSTALLER = "INSTALLER"   # Campo (App Móvil, solo ve entregas asignadas)

# ==========================================
# 2. MODELO DE USUARIO
# ==========================================
class User(SQLModel, table=True):
    """
    Gestión de Identidad y Accesos.
    """
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Credenciales
    email: str = Field(index=True, unique=True)
    hashed_password: str # Encriptada (hash)
    
    # Perfil
    full_name: str
    role: UserRole       # Estricto: Solo permite valores del Enum
    
    # Auditoría y Control
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.now)