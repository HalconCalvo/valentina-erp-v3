from typing import Optional, List
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship
from .foundations import Client

# Evitar ciclos de importación
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .foundations import Client
    from .material import Material

# --- ENUMS (Reglas de Negocio) ---
class VersionStatus(str, Enum):
    DRAFT = "DRAFT"       # Diseño trabajando (Ventas NO puede cotizar)
    READY = "READY"       # Diseño terminó (Ventas YA puede cotizar)
    OBSOLETE = "OBSOLETE" # Versión antigua

# --- NIVEL 1: EL MAESTRO (La Familia del Producto) ---
class ProductMaster(SQLModel, table=True):
    __tablename__ = "design_product_masters"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: Optional[int] = Field(default=None, foreign_key="clients.id", nullable=True)
    name: str = Field(index=True) # Ej: "Cocina Torre Y"
    category: str = Field(default="General") # Cocina, Closet, Baño
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)
    blueprint_path: Optional[str] = None  # <--- NUEVO CAMPO
    
    # Relaciones
    client: Optional["Client"] = Relationship()
    versions: List["ProductVersion"] = Relationship(back_populates="master")


# --- NIVEL 2: LA VERSIÓN (La Hoja Técnica) ---
class ProductVersion(SQLModel, table=True):
    __tablename__ = "design_product_versions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    master_id: int = Field(foreign_key="design_product_masters.id")
    
    version_name: str # Ej: "V1.0 - Herrajes Blum"
    
    # Control de Estado (Vital para el flujo)
    status: str = Field(default=VersionStatus.DRAFT) 
    estimated_cost: float = Field(default=0.0) # Suma caché de materiales
    
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relaciones
    master: Optional["ProductMaster"] = Relationship(back_populates="versions")
    components: List["VersionComponent"] = Relationship(
        back_populates="version", 
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


# --- NIVEL 3: INGREDIENTE DE LA RECETA (Molde) ---
class VersionComponent(SQLModel, table=True):
    __tablename__ = "design_version_components"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    version_id: int = Field(foreign_key="design_product_versions.id")
    
    # VINCULACIÓN FUERTE (Foreign Key a Materiales)
    material_id: int = Field(foreign_key="materials.id", index=True)
    
    quantity: float  # Cantidad Neta (Ej. 5.5 hojas)
    
    # Relaciones
    version: Optional["ProductVersion"] = Relationship(back_populates="components")
    # Nota: La relación 'material' se resolverá al importar Material si es necesario
    material: Optional["Material"] = Relationship()