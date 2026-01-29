from typing import List, Optional
from sqlmodel import SQLModel
from datetime import datetime
from app.models.design import VersionStatus

# ==========================================
# 1. COMPONENTES (Ingredientes de la Receta)
# ==========================================
class VersionComponentBase(SQLModel):
    material_id: int
    quantity: float
    # Opcional: Campos temporales para manejo en frontend
    temp_category: Optional[str] = None 

class VersionComponentCreate(VersionComponentBase):
    pass

class VersionComponentRead(VersionComponentBase):
    id: int

# ==========================================
# 2. MAESTROS (Concepto / Familia)
# NOTA: Se movió arriba para que 'ProductVersionRead' pueda leerlo.
# ==========================================
class ProductMasterBase(SQLModel):
    client_id: int
    name: str
    category: str = "General"
    blueprint_path: Optional[str] = None  # <--- CAMPO NUEVO AGREGADO

# Esquema Ligero para incrustar dentro de la Versión
class ProductMasterSummary(ProductMasterBase):
    id: int
    created_at: datetime
    is_active: bool

class ProductMasterCreate(ProductMasterBase):
    pass

# ==========================================
# 3. VERSIONES (La Hoja Técnica)
# ==========================================
class ProductVersionBase(SQLModel):
    version_name: str
    status: VersionStatus = VersionStatus.DRAFT
    estimated_cost: float = 0.0
    is_active: bool = True

class ProductVersionCreate(ProductVersionBase):
    master_id: int
    components: List[VersionComponentCreate] = []

class ProductVersionRead(ProductVersionBase):
    id: int
    master_id: int
    created_at: datetime
    components: List[VersionComponentRead] = []
    
    # === LA SOLUCIÓN ===
    # Aquí inyectamos el objeto completo del Producto Padre
    master: Optional[ProductMasterSummary] = None 

# ==========================================
# 4. LECTURA MAESTRO COMPLETO (Para Catálogo)
# ==========================================
class ProductMasterRead(ProductMasterBase):
    id: int
    created_at: datetime
    is_active: bool
    # Incluye sus versiones hijas
    versions: List[ProductVersionRead] = []