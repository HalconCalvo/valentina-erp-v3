from datetime import datetime
from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel

# Asegúrate de importar Provider y Material para las Foreign Keys
# Nota: Usamos strings en las relaciones para evitar referencias circulares inmediatas
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
    # provider: Optional[Provider] = Relationship() # Descomentar si se agrega relación en Provider
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


# --- NUEVA ENTIDAD: FACTURAS POR PAGAR (MODULO FINANCIERO) ---
class PurchaseInvoiceBase(SQLModel):
    # Vinculación Estricta: 1 Recepción Física = 1 Deuda Financiera
    reception_id: int = Field(foreign_key="inventory_receptions.id", unique=True) 
    provider_id: int = Field(foreign_key="providers.id")
    
    invoice_uuid: str = Field(index=True) # El Folio Fiscal Real
    total_amount: float
    
    created_at: datetime = Field(default_factory=datetime.now)
    due_date: datetime # FECHA CRÍTICA: Vencimiento de la factura
    
    payment_status: str = Field(default="PENDING") # PENDING, PARTIAL, PAID
    outstanding_balance: float # Saldo pendiente (Inicialmente igual al total_amount)

class PurchaseInvoice(PurchaseInvoiceBase, table=True):
    __tablename__ = "purchase_invoices"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relación inversa opcional para facilitar consultas
    reception: Optional[InventoryReception] = Relationship()