from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship
from datetime import date, datetime
from enum import Enum

# Evitar import circular si Provider está en foundations
if TYPE_CHECKING:
    from backend.app.models.foundations import Provider

# --- ENUMS ---
class InvoiceStatus(str, Enum):
    PENDING = "PENDING"       # Recibida, deuda activa
    PARTIAL = "PARTIAL"       # Pago parcial realizado
    PAID = "PAID"             # Liquidada al 100%
    OVERDUE = "OVERDUE"       # Vencida
    CANCELLED = "CANCELLED"   # Nota de crédito / Error

class PaymentStatus(str, Enum):
    PENDING = "PENDING"     # Solicitado (Gerencia)
    APPROVED = "APPROVED"   # Autorizado (Dirección) - Ya se descuenta del flujo
    REJECTED = "REJECTED"   # Rechazado
    PAID = "PAID"           # Pagado (Tesorería) - Conciliado y enviado

class PaymentMethod(str, Enum):
    TRANSFERENCIA = "TRANSFERENCIA"
    EFECTIVO = "EFECTIVO"
    CHEQUE = "CHEQUE"
    TARJETA = "TARJETA"
    OTRO = "OTRO"

# --- 1. FACTURA DE COMPRA (La Deuda) ---
class PurchaseInvoice(SQLModel, table=True):
    __tablename__ = "purchase_invoices"

    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relación con Proveedor (Tabla providers existente)
    provider_id: int = Field(foreign_key="providers.id")
    
    # Datos Fiscales
    invoice_number: str = Field(index=True) # Folio Factura
    uuid_sat: Optional[str] = None          # Folio Fiscal
    
    # Importes
    total_amount: float
    outstanding_balance: float # Saldo pendiente (Se actualiza con SupplierPayment)
    
    # Fechas
    issue_date: date
    due_date: date   # issue_date + provider.credit_days
    
    status: InvoiceStatus = Field(default=InvoiceStatus.PENDING)
    
    # Auditoría
    created_at: datetime = Field(default_factory=datetime.now)
    pdf_url: Optional[str] = None 

    # Relaciones
    # provider: "Provider" = Relationship() # Descomentar si se importa Provider
    payments: List["SupplierPayment"] = Relationship(back_populates="invoice")


# --- 2. PAGOS A PROVEEDORES (Tu Modelo) ---
class SupplierPayment(SQLModel, table=True):
    __tablename__ = "supplier_payments"

    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relación con la Factura de Compra
    purchase_invoice_id: int = Field(foreign_key="purchase_invoices.id")
    
    # Relación con el Proveedor
    provider_id: int = Field(foreign_key="providers.id") 

    amount: float
    payment_date: datetime
    payment_method: PaymentMethod = Field(default=PaymentMethod.TRANSFERENCIA)
    
    reference: Optional[str] = None # Folio transferencia / Cheque
    notes: Optional[str] = None
    
    status: PaymentStatus = Field(default=PaymentStatus.PENDING)
    
    # Auditoría
    created_at: datetime = Field(default_factory=datetime.now)
    created_by_user_id: int
    approved_by_user_id: Optional[int] = None

    # Relaciones ORM
    invoice: Optional[PurchaseInvoice] = Relationship(back_populates="payments")