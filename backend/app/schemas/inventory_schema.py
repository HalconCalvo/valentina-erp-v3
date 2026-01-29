from typing import List, Optional, Dict
from datetime import datetime
from sqlmodel import SQLModel

# --- INPUTS (Lo que recibimos del Frontend) ---

class ReceptionItemCreate(SQLModel):
    material_id: int
    quantity: float
    line_total_cost: float # El usuario captura el total de la línea ($5000 por 10 hojas)

class ReceptionCreate(SQLModel):
    provider_id: int
    invoice_number: str
    invoice_date: datetime
    # NUEVO CAMPO: Necesario para cuentas por pagar (Vencimiento)
    # Lo dejo Optional por ahora para compatibilidad, pero debería ser requerido a futuro
    due_date: Optional[datetime] = None 
    
    total_amount: float # Suma total de factura para validación
    notes: Optional[str] = None
    items: List[ReceptionItemCreate]

# --- OUTPUTS (Lo que respondemos) ---

class TransactionRead(SQLModel):
    id: int
    material_id: int
    quantity: float
    unit_cost: float
    subtotal: float
    material_name: Optional[str] = None # Para mostrar en UI fácilmente

class ReceptionRead(SQLModel):
    id: int
    provider_id: int
    invoice_number: str
    reception_date: datetime
    total_amount: float
    status: str
    transactions: List[TransactionRead] = []

# --- NUEVOS SCHEMAS: FINANZAS / CUENTAS POR PAGAR ---

class PurchaseInvoiceRead(SQLModel):
    id: int
    reception_id: int
    provider_id: int
    invoice_uuid: str
    total_amount: float
    outstanding_balance: float
    payment_status: str
    due_date: datetime
    created_at: datetime

# Schema para el KPI del Dashboard (Resumen ejecutivo)
class AccountsPayableStats(SQLModel):
    total_payable: float # Deuda Total
    overdue_amount: float # Deuda Vencida
    upcoming_amount: float # Por vencer en 30 días
    breakdown_by_age: Dict[str, float] # Ej: {"1-30": 5000, "31-60": 2000, "+90": 0}