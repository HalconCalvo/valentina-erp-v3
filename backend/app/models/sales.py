from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship, Column, JSON
import enum

# ==========================================
# 1. ENUM DE ESTATUS
# ==========================================
class SalesOrderStatus(str, enum.Enum):
    # FASE 1: CREACIÓN
    DRAFT = "DRAFT"                 
    
    # FASE 2: AUTORIZACIÓN INTERNA
    SENT = "SENT"                   
    ACCEPTED = "ACCEPTED"           
    REJECTED = "REJECTED"           
    
    # FASE 3: CIERRE CON CLIENTE
    SOLD = "SOLD"                   
    CLIENT_REJECTED = "CLIENT_REJECTED" 
    CHANGE_REQUESTED = "CHANGE_REQUESTED" 
    
    # OTROS
    IN_PRODUCTION = "IN_PRODUCTION"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

# --- NUEVOS ENUMS PARA COBRANZA ---
class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"     # No se ha pagado nada (Rojo)
    PARTIAL = "PARTIAL"     # Anticipo o parcialidades (Naranja)
    PAID = "PAID"           # Liquidada al 100% (Verde)

class PaymentMethod(str, enum.Enum):
    TRANSFERENCIA = "TRANSFERENCIA"
    EFECTIVO = "EFECTIVO"
    CHEQUE = "CHEQUE"
    TARJETA = "TARJETA"
    OTRO = "OTRO"

# ==========================================
# 2. MODELO DE PARTIDAS (ITEMS)
# ==========================================
class SalesOrderItem(SQLModel, table=True):
    __tablename__ = "sales_order_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    sales_order_id: Optional[int] = Field(default=None, foreign_key="sales_orders.id")
    
    # Identificación
    product_name: str
    origin_version_id: Optional[int] = Field(default=None) 
    
    # Valores
    quantity: float
    unit_price: float
    subtotal_price: float = Field(default=0.0)
    
    # Ingeniería de Costos
    cost_snapshot: Optional[dict] = Field(default={}, sa_column=Column(JSON)) 
    frozen_unit_cost: float = Field(default=0.0)

    # Relación
    order: Optional["SalesOrder"] = Relationship(back_populates="items")

# ==========================================
# 3. MODELO DE CABECERA (ORDER)
# ==========================================
class SalesOrder(SQLModel, table=True):
    __tablename__ = "sales_orders"

    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relaciones
    client_id: int = Field(foreign_key="clients_v2.id")
    tax_rate_id: int = Field(foreign_key="tax_rates.id")
    user_id: Optional[int] = Field(default=None, foreign_key="users.id") 
    
    # Datos Generales
    project_name: str
    status: SalesOrderStatus = Field(default=SalesOrderStatus.DRAFT)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    valid_until: datetime
    delivery_date: Optional[datetime] = None
    
    # Financiero Venta
    applied_margin_percent: float = Field(default=0.0)
    applied_tolerance_percent: float = Field(default=0.0)
    applied_commission_percent: float = Field(default=0.0)
    
    # --- NUEVO CAMPO: IMPORTE REAL DE COMISIÓN ---
    commission_amount: float = Field(default=0.0) 

    currency: str = Field(default="MXN")
    
    # Totales
    subtotal: float = Field(default=0.0)
    tax_amount: float = Field(default=0.0)
    total_price: float = Field(default=0.0)
    
    # --- NUEVOS CAMPOS PARA CUENTAS POR COBRAR ---
    outstanding_balance: float = Field(default=0.0) # Saldo pendiente de cobro
    payment_status: PaymentStatus = Field(default=PaymentStatus.PENDING)

    # Extras
    notes: Optional[str] = None
    conditions: Optional[str] = None
    external_invoice_ref: Optional[str] = None
    is_warranty: bool = Field(default=False)

    # Relaciones
    items: List[SalesOrderItem] = Relationship(back_populates="order", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    payments: List["CustomerPayment"] = Relationship(back_populates="order")

# ==========================================
# 4. MODELO DE COBROS (NUEVO)
# ==========================================
class CustomerPayment(SQLModel, table=True):
    __tablename__ = "customer_payments"

    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relación con la Orden de Venta
    sales_order_id: int = Field(foreign_key="sales_orders.id")
    
    # Datos del Pago
    amount: float
    payment_date: datetime
    payment_method: PaymentMethod = Field(default=PaymentMethod.TRANSFERENCIA)
    
    reference: Optional[str] = None # Referencia SPEI / Cheque
    notes: Optional[str] = None
    
    # Auditoría
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by_user_id: int
    
    # Relaciones
    order: Optional[SalesOrder] = Relationship(back_populates="payments")