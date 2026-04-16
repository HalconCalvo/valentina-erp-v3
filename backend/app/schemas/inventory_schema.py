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
    created_at: datetime # ✨ NUEVO: Expone la fecha al Frontend
    saldo_acumulado: Optional[float] = None # ✨ NUEVO: Preparación para el Kardex progresivo

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
    total_documents: int # <--- NUEVO CAMPO AGREGADO (Contador de facturas)
    overdue_amount: float # Deuda Vencida
    upcoming_amount: float # Por vencer en 30 días
    breakdown_by_age: Dict[str, float] # Ej: {"1-30": 5000, "31-60": 2000, "+90": 0}


# ==========================================
# SCHEMAS: CATÁLOGO DE PRODUCTOS TERMINADOS
# ==========================================

class ProductCreate(SQLModel):
    """Payload para dar de alta un producto nuevo."""
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    unit_of_measure: str = "PZA"
    base_cost: float = 0.0
    sale_price: float = 0.0
    min_stock: float = 0.0


class ProductUpdate(SQLModel):
    """Campos editables de un producto (todos opcionales)."""
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit_of_measure: Optional[str] = None
    base_cost: Optional[float] = None
    sale_price: Optional[float] = None
    min_stock: Optional[float] = None
    is_active: Optional[bool] = None


class ProductRead(SQLModel):
    """Representación de un producto al consultarlo."""
    id: int
    sku: str
    name: str
    description: Optional[str]
    category: Optional[str]
    unit_of_measure: str
    base_cost: float
    sale_price: float
    stock_quantity: float
    min_stock: float
    is_active: bool
    created_at: datetime


class StockMovementCreate(SQLModel):
    """Payload para registrar una entrada o ajuste de stock."""
    movement_type: str   # ENTRADA | SALIDA | AJUSTE_POSITIVO | AJUSTE_NEGATIVO
    quantity: float
    unit_cost: Optional[float] = None
    reference: Optional[str] = None
    notes: Optional[str] = None