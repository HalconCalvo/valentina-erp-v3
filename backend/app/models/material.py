from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship
from enum import Enum

# Importamos Provider solo para tipado
if TYPE_CHECKING:
    from .foundations import Provider

# --- ENUM (Movido aquí porque lo usa Material) ---
class ProductionRoute(str, Enum):
    MATERIAL = "MATERIAL"
    PROCESO = "PROCESO"
    CONSUMIBLE = "CONSUMIBLE"
    SERVICIO = "SERVICIO"

class Material(SQLModel, table=True):
    """
    Modelo maestro de materiales e insumos (Versión 3.0).
    """
    __tablename__ = "materials"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Identificación
    sku: str = Field(index=True, unique=True)
    name: str
    
    # Clasificación
    category: str  
    production_route: ProductionRoute  # Usamos el Enum estricto
    
    # Unidades
    purchase_unit: str
    usage_unit: str
    conversion_factor: float = Field(default=1.0) 
    
    # Costos e Inventario
    current_cost: float = Field(default=0.0) 
    physical_stock: float = Field(default=0.0)
    
    # --- CAMPOS NUEVOS V3 ---
    committed_stock: float = Field(default=0.0) # Stock Comprometido
    is_active: bool = Field(default=True)       # Borrado suave
    
    # Lógica de Tapacanto
    associated_element_sku: Optional[str] = Field(default=None)
    
    # Relaciones
    provider_id: Optional[int] = Field(default=None, foreign_key="providers.id")
    provider: Optional["Provider"] = Relationship(back_populates="materials")