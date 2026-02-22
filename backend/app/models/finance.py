from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship
from datetime import date, datetime
from enum import Enum

# Evitar import circular
if TYPE_CHECKING:
    from backend.app.models.foundations import Provider
    from backend.app.models.treasury import BankAccount, BankTransaction

# --- ENUMS ---
class InvoiceStatus(str, Enum):
    PENDING = "PENDING"       # Recibida, deuda activa
    PARTIAL = "PARTIAL"       # Pago parcial realizado
    PAID = "PAID"             # Liquidada al 100%
    OVERDUE = "OVERDUE"       # Vencida
    CANCELLED = "CANCELLED"   # Nota de crédito / Error

class PaymentStatus(str, Enum):
    PENDING = "PENDING"     # Solicitado (Administración sugiere)
    APPROVED = "APPROVED"   # Autorizado (Dirección dictamina cuenta)
    REJECTED = "REJECTED"   # Rechazado
    PAID = "PAID"           # Ejecutado (Dinero salió de Tesorería)

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
    
    provider_id: int = Field(foreign_key="providers.id")
    
    invoice_number: str = Field(index=True) 
    uuid_sat: Optional[str] = None          
    
    total_amount: float
    outstanding_balance: float # Saldo pendiente vivo
    
    issue_date: date
    due_date: date   
    
    status: InvoiceStatus = Field(default=InvoiceStatus.PENDING)
    
    created_at: datetime = Field(default_factory=datetime.now)
    pdf_url: Optional[str] = None 

    # Relaciones
    payments: List["SupplierPayment"] = Relationship(back_populates="invoice")

# --- 2. SOLICITUDES Y PAGOS A PROVEEDORES (El Evento) ---
class SupplierPayment(SQLModel, table=True):
    __tablename__ = "supplier_payments"

    id: Optional[int] = Field(default=None, primary_key=True)
    
    purchase_invoice_id: int = Field(foreign_key="purchase_invoices.id")
    provider_id: int = Field(foreign_key="providers.id") 

    amount: float
    payment_date: datetime # Fecha en la que se solicita/programa el pago
    payment_method: PaymentMethod = Field(default=PaymentMethod.TRANSFERENCIA)
    
    # --- NUEVOS CAMPOS: EL PUENTE CON TESORERÍA ---
    # Cuenta que Administración sugiere para el pago
    suggested_account_id: Optional[int] = Field(default=None, foreign_key="bank_accounts.id")
    # Cuenta que Dirección impone y autoriza para el pago
    approved_account_id: Optional[int] = Field(default=None, foreign_key="bank_accounts.id")
    # Vínculo exacto con el movimiento del Libro Mayor (AccountDetail.tsx)
    treasury_transaction_id: Optional[int] = Field(default=None, foreign_key="bank_transactions.id", unique=True)
    # ----------------------------------------------

    reference: Optional[str] = None 
    notes: Optional[str] = None
    
    status: PaymentStatus = Field(default=PaymentStatus.PENDING)
    
    created_at: datetime = Field(default_factory=datetime.now)
    created_by_user_id: int
    approved_by_user_id: Optional[int] = None

    # Relaciones ORM
    invoice: Optional[PurchaseInvoice] = Relationship(back_populates="payments")