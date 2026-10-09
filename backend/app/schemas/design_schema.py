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
    current_cost: Optional[float] = None      # precio actual del material
    conversion_factor: Optional[float] = None  # factor de conversión (ej. 1000 para tornillos por millar)

# ==========================================
# 2. MAESTROS (Concepto / Familia)
# NOTA: Se movió arriba para que 'ProductVersionRead' pueda leerlo.
# ==========================================
class ProductMasterBase(SQLModel):
    client_id: int
    name: str
    category: str = "General"
    project_name: Optional[str] = None

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
    material_cost: float = 0.0
    is_active: bool = True

class ProductVersionCreate(ProductVersionBase):
    master_id: int
    components: List[VersionComponentCreate] = []
    commercial_description: Optional[str] = None
    # Clone: with no components, copy the recipe of this version (the one being viewed)
    clone_from_version_id: Optional[int] = None

class ProductVersionUpdate(SQLModel):
    commercial_description: Optional[str] = None

class ProductVersionRead(ProductVersionBase):
    id: int
    master_id: int
    created_at: datetime
    components: List[VersionComponentRead] = []
    blueprint_path: Optional[str] = None
    commercial_description: Optional[str] = None
    
    # === LA SOLUCIÓN ===
    # Aquí inyectamos el objeto completo del Producto Padre
    master: Optional[ProductMasterSummary] = None
    alerts: List[str] = []   # avisos al consultar (ej. materiales inactivos)
    # Correction lineage and immutability
    replaces_version_id: Optional[int] = None
    correction_note: Optional[str] = None
    corrected_at: Optional[datetime] = None
    corrected_in_quotation_id: Optional[int] = None
    is_locked: bool = False

# ==========================================
# 4. LECTURA MAESTRO COMPLETO (Para Catálogo)
# ==========================================
class ProductMasterRead(ProductMasterBase):
    id: int
    created_at: datetime
    is_active: bool
    client_name: Optional[str] = None
    # Incluye sus versiones hijas
    versions: List[ProductVersionRead] = []