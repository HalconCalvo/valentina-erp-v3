from typing import List, Optional, Dict, Any
from sqlmodel import SQLModel
from datetime import datetime

# Importamos los Enums directamente desde los modelos
from app.models.sales import (
    SalesOrderStatus, 
    PaymentStatus, 
    PaymentMethod, 
    InstanceStatus
)

# ==========================================
# 1. COBROS (Customer Payments)
# ==========================================
class CustomerPaymentBase(SQLModel):
    amount: float
    payment_date: Optional[datetime] = None
    payment_method: PaymentMethod = PaymentMethod.TRANSFERENCIA
    reference: Optional[str] = None
    notes: Optional[str] = None

class CustomerPaymentCreate(CustomerPaymentBase):
    sales_order_id: int
    created_by_user_id: int

class CustomerPaymentRead(CustomerPaymentBase):
    id: int
    sales_order_id: int
    created_at: datetime
    created_by_user_id: int


# ==========================================
# 2. INSTANCIAS DE PRODUCCIÓN (Nivel 3)
# ==========================================
class SalesOrderItemInstanceBase(SQLModel):
    custom_name: str
    production_status: InstanceStatus = InstanceStatus.PENDING
    production_batch_id: Optional[int] = None
    is_cancelled: bool = False
    qr_code: Optional[str] = None
    current_location: Optional[str] = "Planeación"

class SalesOrderItemInstanceRead(SalesOrderItemInstanceBase):
    id: int
    sales_order_item_id: int

class SalesOrderItemInstanceUpdate(SQLModel):
    # Usado cuando Ventas "Bautiza" la instancia (Ej. "Casa 32") o Fábrica actualiza estatus
    custom_name: Optional[str] = None
    production_status: Optional[InstanceStatus] = None
    production_batch_id: Optional[int] = None
    is_cancelled: Optional[bool] = None
    current_location: Optional[str] = None


# ==========================================
# 3. PARTIDAS / RECETAS (Nivel 2)
# ==========================================
class SalesOrderItemBase(SQLModel):
    product_name: str
    origin_version_id: Optional[int] = None
    quantity: float
    unit_price: float
    
    # Costos ciegos (Finanzas)
    cost_snapshot: Dict[str, Any] = {} 
    frozen_unit_cost: float = 0.0

class SalesOrderItemCreate(SalesOrderItemBase):
    # Nota: Las instancias NO se envían aquí. El Backend las generará 
    # automáticamente leyendo el campo `quantity`.
    pass

class SalesOrderItemRead(SalesOrderItemBase):
    id: int
    sales_order_id: int
    subtotal_price: float 
    
    # Se exponen las instancias hijas al Frontend
    instances: List[SalesOrderItemInstanceRead] = []


# ==========================================
# 4. ORDEN DE VENTA (Cabecera - Nivel 1)
# ==========================================
class SalesOrderBase(SQLModel):
    project_name: str
    client_id: int
    tax_rate_id: int
    
    valid_until: datetime
    delivery_date: Optional[datetime] = None
    
    # Reglas Financieras
    applied_margin_percent: float = 0.0
    applied_tolerance_percent: float = 0.0
    applied_commission_percent: float = 0.0 
    
    currency: str = "MXN"
    notes: Optional[str] = None      
    conditions: Optional[str] = None 
    external_invoice_ref: Optional[str] = None
    is_warranty: bool = False

# INPUT: Creación inicial (Borrador)
class SalesOrderCreate(SalesOrderBase):
    items: List[SalesOrderItemCreate] = []

# OUTPUT: Lectura completa (Árbol jerárquico)
class SalesOrderRead(SalesOrderBase):
    id: int
    status: SalesOrderStatus
    created_at: datetime
    
    # Cálculos y finanzas
    subtotal: float
    tax_amount: float
    total_price: float
    commission_amount: float
    outstanding_balance: float
    payment_status: PaymentStatus
    
    user_id: Optional[int] = None 
    
    # Relaciones anidadas
    items: List[SalesOrderItemRead] = []
    payments: List[CustomerPaymentRead] = []

# INPUT: Actualización (Cambio de estatus, ajuste de directivo, etc.)
class SalesOrderUpdate(SQLModel):
    project_name: Optional[str] = None
    client_id: Optional[int] = None        
    tax_rate_id: Optional[int] = None      
    valid_until: Optional[datetime] = None 
    is_warranty: Optional[bool] = None     
    
    status: Optional[SalesOrderStatus] = None
    delivery_date: Optional[datetime] = None
    external_invoice_ref: Optional[str] = None
    
    notes: Optional[str] = None
    conditions: Optional[str] = None
    
    # Intervención Directiva (Blindaje Financiero)
    applied_margin_percent: Optional[float] = None
    applied_commission_percent: Optional[float] = None
    
    # Si Ventas re-cotiza o se ajustan manuales
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    total_price: Optional[float] = None

    items: Optional[List[SalesOrderItemCreate]] = None