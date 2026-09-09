from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
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

class CustomerPaymentInstallmentRead(SQLModel):
    id: int
    amount: float
    payment_date: datetime
    is_cancelled: bool = False
    reference: Optional[str] = None
    concept: Optional[str] = Field(default=None, validation_alias="notes")

    class Config:
        from_attributes = True
        populate_by_name = True

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

    retention_percent: float = 0.0
    retention_amount: float = 0.0
    retention_days: int = 90
    retention_due_date: Optional[datetime] = None
    retention_status: Optional[str] = None
    retention_invoice_folio: Optional[str] = None
    retention_notes: Optional[str] = None

    nc_advance_folio: Optional[str] = None
    nc_advance_amount: float = 0.0
    nc_retention_folio: Optional[str] = None
    nc_retention_amount: float = 0.0

    installments: List[CustomerPaymentInstallmentRead] = []

# ==========================================
# 2. INSTANCIAS DE PRODUCCIÓN (Nivel 3)
# ==========================================
class SalesOrderItemInstanceBase(SQLModel):
    custom_name: str
    street: Optional[str] = None
    lot: Optional[str] = None
    production_status: InstanceStatus = InstanceStatus.PENDING
    production_batch_id: Optional[int] = None
    is_cancelled: bool = False
    qr_code: Optional[str] = None
    current_location: Optional[str] = "Planeación"
    customer_payment_id: Optional[int] = None # <--- Candado: ¿Ya se facturó/cobró?

class SalesOrderItemInstanceRead(SalesOrderItemInstanceBase):
    id: int
    sales_order_item_id: int
    description_override: Optional[str] = None

class SalesOrderItemInstanceUpdate(SQLModel):
    custom_name: Optional[str] = None
    description_override: Optional[str] = None
    production_status: Optional[InstanceStatus] = None
    production_batch_id: Optional[int] = None
    is_cancelled: Optional[bool] = None
    current_location: Optional[str] = None
    customer_payment_id: Optional[int] = None
    administration_invoice_folio: Optional[str] = None

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
    is_resale: bool = False
    resale_sku: Optional[str] = None
    commercial_description: Optional[str] = None

class SalesOrderItemCreate(SalesOrderItemBase):
    pass

class AddItemsPayload(SQLModel):
    items: List[SalesOrderItemCreate]

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

    default_retention_percent: float = 0.0
    default_retention_days: int = 90

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
    advance_invoice_amount: Optional[float] = None
    
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
    advance_invoice_amount: Optional[float] = None

    # Si Ventas re-cotiza o se ajustan manuales
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    total_price: Optional[float] = None

    items: Optional[List[SalesOrderItemCreate]] = None


# ==========================================
# EDICIÓN Y CANCELACIÓN DE CXC (Customer Payments)
# ==========================================

class CustomerPaymentUpdate(BaseModel):
    """Campos editables de una factura/cobro de cliente (todos opcionales — PATCH)."""
    invoice_folio: Optional[str] = None
    invoice_date: Optional[datetime] = None
    amount: Optional[float] = None
    notes: Optional[str] = None
    instance_ids: Optional[List[int]] = None


class CustomerPaymentCancel(BaseModel):
    """Payload para cancelar una factura/cobro pendiente."""
    cancel_reason: str


class InstallmentUpdate(BaseModel):
    """Campos editables de un abono parcial (PATCH)."""
    amount: Optional[float] = None
    payment_date: Optional[datetime] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    instance_ids: Optional[List[int]] = None
    is_advance: Optional[bool] = None


class InstallmentCancel(BaseModel):
    """Payload para cancelar un abono registrado."""
    cancel_reason: str


# ==========================================
# PAYLOADS Y PATCHES DE ENDPOINTS (sales)
# ==========================================

class PaymentPayload(BaseModel):
    invoice_folio: Optional[str] = None
    amount: float = 0.0
    amortized_advance: float = 0.0
    instance_ids: List[int] = []
    payment_date: Optional[datetime] = None
    invoice_date: Optional[datetime] = None
    notes: Optional[str] = None
    reference: Optional[str] = None
    account_id: Optional[int] = None
    is_advance: bool = False
    nc_advance_folio: Optional[str] = None
    nc_advance_amount: float = 0.0
    nc_retention_folio: Optional[str] = None
    nc_retention_amount: float = 0.0


class ClientPurchaseOrderPayload(BaseModel):
    """Datos obligatorios de la OC del cliente para generar OV (paso a WAITING_ADVANCE)."""
    client_po_folio: str
    client_po_date: datetime


class ResaleItemPatch(BaseModel):
    quantity: Optional[int] = None
    unit_price: Optional[float] = None
    resale_sku: Optional[str] = None
    product_name: Optional[str] = None


class ProductionItemPatch(BaseModel):
    unit_price: float


class RegisterProgressPayload(BaseModel):
    invoice_folio: Optional[str] = None
    amount: float = 0.0
    amortized_advance: float = 0.0
    instance_ids: List[int] = []
    invoice_date: Optional[datetime] = None
    nc_advance_folio: Optional[str] = None
    nc_advance_amount: float = 0.0
    nc_retention_folio: Optional[str] = None
    nc_retention_amount: float = 0.0


class InvoicingRightAdvanceRow(BaseModel):
    order_id: int
    project_name: Optional[str] = None
    client_name: str
    advance_percent: float
    total_price: float
    advance_amount: float


class InvoicingRightProgressRow(BaseModel):
    instance_id: int
    custom_name: str
    production_status: str
    line_amount: float
    signed_received_at: Optional[str] = None
    order_id: Optional[int] = None
    order_folio: str
    project_name: Optional[str] = None
    client_name: str
    item_product_name: Optional[str] = None


class InvoicingRightsRead(BaseModel):
    """Derecho a facturación (Tarjeta B): anticipos sin CXC ADVANCE + piezas CLOSED sin factura."""

    advance_pending_total: float
    progress_work_total: float
    total_pending_invoice: float
    advances: List[InvoicingRightAdvanceRow]
    progress_instances: List[InvoicingRightProgressRow]


class PaymentCommissionUpdate(BaseModel):
    commission_paid: bool


class SalesCommissionRead(BaseModel):
    id: int
    customer_payment_id: int
    user_id: int
    user_name: Optional[str]
    user_role: Optional[str]
    commission_type: str
    base_amount: float
    rate: float
    commission_amount: float
    is_paid: bool
    created_at: datetime
    is_advance: bool = False
    is_released: bool = False
    released_at: Optional[datetime] = None

    sales_order_id: Optional[int] = None
    project_name: Optional[str] = None
    payment_amount: Optional[float] = None
    admin_notes: Optional[str] = None
    payroll_deferred: bool = False

    class Config:
        from_attributes = True


class PayrollCommissionRow(BaseModel):
    """Fila de auditoría de nómina de comisiones (totales independientes por bucket)."""
    kind: str  # PROVISIONAL | ACCRUED
    id: Optional[int] = None
    sales_order_id: int
    project_name: Optional[str] = None
    seller_name: Optional[str] = None
    amount: float
    days_waiting: int
    reference_label: str
    customer_payment_id: Optional[int] = None
    cxc_status: Optional[str] = None
    admin_notes: Optional[str] = None
    payroll_deferred: bool = False


class CommissionsPayrollOverview(BaseModel):
    retained_total: float
    payable_total: float
    paid_total: float
    retained: List[PayrollCommissionRow]
    payable: List[PayrollCommissionRow]
    paid: List[PayrollCommissionRow]


class CommissionPayrollUpdate(BaseModel):
    admin_notes: Optional[str] = None
    payroll_deferred: Optional[bool] = None


class CommissionPaidUpdate(BaseModel):
    is_paid: bool


class InstanceStatusSummary(BaseModel):
    id: int
    product_name: str
    custom_name: str
    production_status: str
    production_batch_id: Optional[int] = None
    qr_code: Optional[str] = None


class HouseStatusSummary(BaseModel):
    street: str
    lot: str
    grouping_key: str
    total: int
    by_status: dict
    instances: List[InstanceStatusSummary]


class OrderHousesStatus(BaseModel):
    order_id: int
    order_folio: str
    project_name: str
    client_name: str
    status: str
    houses: List[HouseStatusSummary]
    unassigned: List[InstanceStatusSummary]


class RetentionUpdate(SQLModel):
    retention_percent: Optional[float] = None
    retention_amount: Optional[float] = None
    retention_days: Optional[int] = None
    retention_due_date: Optional[datetime] = None
    retention_notes: Optional[str] = None


class RetentionInvoicePayload(BaseModel):
    folio: str


class RetentionWaivePayload(BaseModel):
    reason: str


class RetentionDefaultsUpdate(SQLModel):
    default_retention_percent: float
    default_retention_days: int


class RetentionAlertRead(SQLModel):
    payment_id: int
    sales_order_id: int
    order_folio: str
    project_name: str
    client_name: str
    invoice_folio: Optional[str] = None
    retention_amount: float
    retention_due_date: Optional[datetime] = None
    retention_status: Optional[str] = None
    days_until_due: int
    is_overdue: bool