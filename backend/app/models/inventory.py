from datetime import datetime
from typing import List, Optional, TYPE_CHECKING
from sqlmodel import Field, Relationship, SQLModel

# Usamos TYPE_CHECKING para evitar importaciones circulares en tiempo de ejecución
if TYPE_CHECKING:
    from .foundations import Provider 
    from .material import Material

class InventoryReceptionBase(SQLModel):
    provider_id: int = Field(foreign_key="providers.id")
    invoice_number: str = Field(index=True) # Folio Factura
    invoice_date: datetime 
    reception_date: datetime = Field(default_factory=datetime.now)
    total_amount: float # Monto total de la factura
    notes: Optional[str] = None
    status: str = Field(default="COMPLETED") # COMPLETED, CANCELLED

class InventoryReception(InventoryReceptionBase, table=True):
    __tablename__ = "inventory_receptions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relaciones
    transactions: List["InventoryTransaction"] = Relationship(back_populates="reception")


class InventoryTransactionBase(SQLModel):
    reception_id: Optional[int] = Field(default=None, foreign_key="inventory_receptions.id")
    material_id: int = Field(foreign_key="materials.id")
    
    quantity: float # Cantidad que entra (+) o sale (-)
    unit_cost: float # Costo calculado al momento
    subtotal: float # Costo total de la línea
    
    transaction_type: str = Field(default="PURCHASE_ENTRY") # ENTRADA_COMPRA
    created_at: datetime = Field(default_factory=datetime.now)

class InventoryTransaction(InventoryTransactionBase, table=True):
    __tablename__ = "inventory_transactions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relaciones
    reception: Optional[InventoryReception] = Relationship(back_populates="transactions")
    # material: Optional[Material] = Relationship()

# --- NOTA TÉCNICA ---
# La entidad 'PurchaseInvoice' (Facturas por Pagar) se eliminó de este archivo.
# Ahora reside en 'backend/app/models/finance.py' para evitar conflictos de
# definición duplicada en SQLAlchemy (Error: Table already defined).