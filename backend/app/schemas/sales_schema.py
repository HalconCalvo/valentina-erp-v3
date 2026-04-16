from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from sqlmodel import SQLModel
from datetime import datetime

# Importamos los Enums directamente desde los modelos
from app.models.sales import (
    SalesOrderStatus, 
    PaymentStatus, 
    PaymentMethod,
    PaymentType, 
    InstanceStatus,
    CXCStatus
)

# ==========================================
# PAYLOAD PARA CONFIRMAR PAGOS Y FACTURAS
# ==========================================
class InvoicePayload(BaseModel):
    invoice_folio: Optional[str] = None

# ==========================================
# 1. COBROS (Customer Payments - HÍBRIDO)
# ==========================================
class CustomerPaymentBase(SQLModel):
    amount: float
    amortized_advance: float = 0.0                  # <--- Dinero descontado de la bolsa
    payment_type: PaymentType = PaymentType.PROGRESS # <--- Tipo de cobro
    invoice_folio: Optional[str] = None             # <--- La factura (F-023)
    
    payment_date: Optional[datetime] = None
    payment_method: PaymentMethod = PaymentMethod.TRANSFER
    reference: Optional[str] = None
    notes: Optional[str] = None

class CustomerPaymentCreate(CustomerPaymentBase):
    sales_order_id: int
    created_by_user_id: int

class CustomerPaymentRead(CustomerPaymentBase):
    id: int
    sales_order_id: int
    
    # ---> NUEVA ADUANA ABIERTA: DEJAMOS PASAR LA MAGIA FINANCIERA <---
    status: CXCStatus
    invoice_date: datetime
    treasury_transaction_id: Optional[int] = None
    
    created_at: datetime
    created_by_user_id: int
    commission_paid: bool = False

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
    customer_payment_id: Optional[int] = None # <--- Candado: ¿Ya se facturó/cobró?

class SalesOrderItemInstanceRead(SalesOrderItemInstanceBase):
    id: int
    sales_order_item_id: int

class SalesOrderItemInstanceUpdate(SQLModel):
    custom_name: Optional[str] = None
    production_status: Optional[InstanceStatus] = None
    production_batch_id: Optional[int] = None
    is_cancelled: Optional[bool] = None
    current_location: Optional[str] = None
    customer_payment_id: Optional[int] = None

# ==========================================
# 3. PARTIDAS / RECETAS (Nivel 2)
# ==========================================
class SalesOrderItemBase(SQLModel):
    product_name: str
    origin_version_id: Optional[int] = None
    quantity: float
    unit_price: float
    cost_snapshot: Dict[str, Any] = {} 
    frozen_unit_cost: float = 0.0

class SalesOrderItemCreate(SalesOrderItemBase):
    pass

class SalesOrderItemRead(SalesOrderItemBase):
    id: int
    sales_order_id: int
    subtotal_price: float 
    instances: List[SalesOrderItemInstanceRead] = []

# ==========================================
# MINI-ESQUEMA PARA LEER EL CLIENTE EN LA ORDEN
# ==========================================
class ClientReadBasic(SQLModel):
    id: int
    full_name: str

# ==========================================
# 4. ORDEN DE VENTA (Cabecera - Nivel 1)
# ==========================================
class SalesOrderBase(SQLModel):
    project_name: str
    client_id: int
    tax_rate_id: int
    
    valid_until: datetime
    delivery_date: Optional[datetime] = None

    # V5 — OC cliente (captura al aceptar cotización; editable por staff en órdenes legadas)
    client_po_folio: Optional[str] = None
    client_po_date: Optional[datetime] = None
    
    # Reglas Financieras
    applied_margin_percent: float = 0.0
    applied_tolerance_percent: float = 0.0
    applied_commission_percent: float = 0.0 
    
    # --- NUEVOS CAMPOS: LÓGICA DE ANTICIPO (V3.5) ---
    advance_percent: float = 60.0
    has_advance_invoice: bool = False
    # (¡Eliminamos los folios estáticos de aquí!)

    currency: str = "MXN"
    notes: Optional[str] = None      
    conditions: Optional[str] = None 
    external_invoice_ref: Optional[str] = None
    is_warranty: bool = False

# INPUT: Creación inicial
class SalesOrderCreate(SalesOrderBase):
    items: List[SalesOrderItemCreate] = []

# OUTPUT: Lectura completa
# OUTPUT: Lectura completa
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
    client: Optional[ClientReadBasic] = None  # <--- ¡EL ESLABÓN PERDIDO!
    
    # ---> ¡LA LLAVE MAESTRA PARA QUE PASE EL NOMBRE DEL ASESOR! <---
    user: Optional[Any] = None 
    
    items: List[SalesOrderItemRead] = []
    payments: List[CustomerPaymentRead] = []

# INPUT: Actualización
class SalesOrderUpdate(SQLModel):
    project_name: Optional[str] = None
    client_id: Optional[int] = None        
    tax_rate_id: Optional[int] = None      
    valid_until: Optional[datetime] = None 
    is_warranty: Optional[bool] = None     
    
    status: Optional[SalesOrderStatus] = None
    delivery_date: Optional[datetime] = None
    external_invoice_ref: Optional[str] = None

    client_po_folio: Optional[str] = None
    client_po_date: Optional[datetime] = None
    
    notes: Optional[str] = None
    conditions: Optional[str] = None
    
    # Intervención Directiva
    applied_margin_percent: Optional[float] = None
    applied_commission_percent: Optional[float] = None
    
    # --- NUEVOS CAMPOS DE ACTUALIZACIÓN ---
    advance_percent: Optional[float] = None
    has_advance_invoice: Optional[bool] = None

    # Si Ventas re-cotiza o se ajustan manuales
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    total_price: Optional[float] = None

    items: Optional[List[SalesOrderItemCreate]] = None