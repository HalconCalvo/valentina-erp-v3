from typing import Optional
from datetime import datetime, date
from sqlmodel import SQLModel
from app.models.finance import PaymentStatus, PaymentMethod

# --- INPUTS ---
class PaymentRequestCreate(SQLModel):
    invoice_id: int
    amount: float
    payment_date: date 
    payment_method: PaymentMethod
    # NUEVO: La cuenta de donde Administración sugiere sacar el dinero
    suggested_account_id: Optional[int] = None
    reference: Optional[str] = None
    notes: Optional[str] = None

class PaymentApprovalUpdate(SQLModel):
    status: PaymentStatus 
    # NUEVO: La cuenta bancaria que Dirección impone al momento de autorizar
    approved_account_id: Optional[int] = None

# --- OUTPUTS ---
class SupplierPaymentRead(SQLModel):
    id: int
    purchase_invoice_id: int
    provider_id: int
    provider_name: Optional[str] = None 
    invoice_folio: Optional[str] = None 
    amount: float
    payment_date: date
    payment_method: PaymentMethod
    
    # NUEVOS: Exponemos el puente con Tesorería al Frontend
    suggested_account_id: Optional[int] = None
    approved_account_id: Optional[int] = None
    treasury_transaction_id: Optional[int] = None
    
    reference: Optional[str] = None
    notes: Optional[str] = None
    status: PaymentStatus
    created_at: datetime

# --- DASHBOARD / MESA DE CONTROL (MODIFICADO CON CONTADORES) ---
class AccountsPayableDashboardStats(SQLModel):
    """
    Resumen para las 3 Tarjetas Gerenciales (Semáforo de Flujo)
    """
    # TARJETA 1 (ROJA)
    overdue_amount: float
    overdue_count: int = 0      
    
    # TARJETA 2 (NARANJA)
    next_period_amount: float
    next_period_count: int = 0  
    
    # TARJETA 3 (VERDE)
    future_amount: float
    future_count: int = 0       
    
    # CONTADOR GLOBAL
    total_pending_approval: int

# --- LISTADO DE FACTURAS ---
class PendingInvoiceRead(SQLModel):
    id: int
    provider_name: str
    invoice_number: str
    due_date: date 
    total_amount: float
    outstanding_balance: float