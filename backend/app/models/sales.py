from typing import Optional, List, Dict, Any, TYPE_CHECKING
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship, Column, JSON
import enum

# Usamos TYPE_CHECKING para evitar importaciones circulares en tiempo de ejecución
if TYPE_CHECKING:
    from app.models.foundations import Client
    from app.models.users import User

# ==========================================
# 1. ENUMS (REGLAS DE NEGOCIO Y ESTATUS)
# ==========================================
class SalesOrderStatus(str, enum.Enum):
    DRAFT = "DRAFT"                 
    SENT = "SENT"                   
    ACCEPTED = "ACCEPTED"           
    REJECTED = "REJECTED"
    WAITING_ADVANCE = "WAITING_ADVANCE"           
    SOLD = "SOLD"                   
    CLIENT_REJECTED = "CLIENT_REJECTED" 
    CHANGE_REQUESTED = "CHANGE_REQUESTED" 
    IN_PRODUCTION = "IN_PRODUCTION"
    FINISHED = "FINISHED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"     
    PARTIAL = "PARTIAL"     
    PAID = "PAID"           

class PaymentMethod(str, enum.Enum):
    TRANSFER = "TRANSFER"
    CASH = "CASH"
    CHECK = "CHECK"
    CREDIT_CARD = "CREDIT_CARD"
    OTHER = "OTHER"

class PaymentType(str, enum.Enum):
    ADVANCE = "ADVANCE"         
    PROGRESS = "PROGRESS"       
    SETTLEMENT = "SETTLEMENT"   

class CXCStatus(str, enum.Enum):
    PENDING = "PENDING"     
    PAID = "PAID"           
    CANCELLED = "CANCELLED"

class CommissionType(str, enum.Enum):
    SELLER = "SELLER"
    DIRECTOR_GLOBAL = "DIRECTOR_GLOBAL"

class InstanceStatus(str, enum.Enum):
    PENDING = "PENDING"             # 🔘 Gris: Programado (sin lote)
    IN_PRODUCTION = "IN_PRODUCTION" # 🔵 Azul: Lote generado / en corte
    READY = "READY"                 # 🔵🟢 Azul-Verde: Material empacado en andén
    CARGADO = "CARGADO"             # 🔵🔵 Doble Azul: Escaneo de carga, cuadrilla en tránsito
    INSTALLED = "INSTALLED"         # 🟢 Verde: Evidencia fotográfica subida
    CLOSED = "CLOSED"               # 🟢🟢 Doble Verde: Firma de conformidad capturada
    WARRANTY = "WARRANTY"           # ⚠️ Garantía: Instancia cerrada reabierta para reparación

# ==========================================
# 2. MODELO DE COMISIONES (REGISTRO DETALLADO)
# ==========================================
class SalesCommission(SQLModel, table=True):
    __tablename__ = "sales_commissions"

    id: Optional[int] = Field(default=None, primary_key=True)
    customer_payment_id: int = Field(foreign_key="customer_payments.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    commission_type: CommissionType = Field(default=CommissionType.SELLER)

    base_amount: float
    rate: float
    commission_amount: float

    is_paid: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Tesorería / nómina: observaciones y aplazamiento de pago de comisión
    admin_notes: Optional[str] = Field(default=None)
    payroll_deferred: bool = Field(default=False)

# ==========================================
# 3. MODELO DE COBROS (CUENTAS POR COBRAR - CXC)
# ==========================================
class CustomerPayment(SQLModel, table=True):
    __tablename__ = "customer_payments"

    id: Optional[int] = Field(default=None, primary_key=True)
    sales_order_id: int = Field(foreign_key="sales_orders.id")
    
    payment_type: PaymentType = Field(default=PaymentType.PROGRESS)
    invoice_folio: Optional[str] = Field(default=None, index=True) 
    status: CXCStatus = Field(default=CXCStatus.PENDING)
    
    amount: float 
    amortized_advance: float = Field(default=0.0) 
    
    invoice_date: datetime = Field(default_factory=datetime.utcnow) 
    payment_date: Optional[datetime] = None 
    
    payment_method: PaymentMethod = Field(default=PaymentMethod.TRANSFER)
    reference: Optional[str] = None 
    notes: Optional[str] = None
    treasury_transaction_id: Optional[int] = Field(default=None, foreign_key="bank_transactions.id", unique=True)
    commission_paid: bool = Field(default=False)
    
    # ---> NUEVO SENSOR: HISTÓRICO DE DIVISAS <---
    exchange_rate: Optional[float] = Field(default=1.0)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by_user_id: int 
    
    order: Optional["SalesOrder"] = Relationship(back_populates="payments")
    instances_paid: List["SalesOrderItemInstance"] = Relationship(back_populates="payment")
    
# ==========================================
# 3. MODELO DE INSTANCIAS (NIVEL 3 - EL ÁTOMO)
# ==========================================
class SalesOrderItemInstance(SQLModel, table=True):
    __tablename__ = "sales_order_item_instances"

    id: Optional[int] = Field(default=None, primary_key=True)
    sales_order_item_id: int = Field(foreign_key="sales_order_items.id")
    
    custom_name: str = Field(index=True)  
    production_status: InstanceStatus = Field(default=InstanceStatus.PENDING)
    production_batch_id: Optional[int] = Field(default=None) 
    is_cancelled: bool = Field(default=False) 
    
    qr_code: Optional[str] = Field(default=None, unique=True, index=True) 
    current_location: Optional[str] = Field(default="Planeación") 
    declared_bundles: Optional[int] = Field(default=None)
    customer_payment_id: Optional[int] = Field(default=None, foreign_key="customer_payments.id")
    
    # ========================================================
    # INYECCIÓN: RUTA CRÍTICA, CRONÓMETROS Y COBRANZA GERENCIAL
    # ========================================================
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    qc_rejections_count: Optional[int] = Field(default=0) # Alerta de No Calidad
    
    delivery_deadline: Optional[datetime] = Field(default=None) # Límite pactado
    current_stage_deadline: Optional[datetime] = Field(default=None) # Límite del cuello de botella actual
    
    signed_received_at: Optional[datetime] = Field(default=None) # Detona la garantía de 1 año
    administration_invoice_folio: Optional[str] = Field(default=None) # Control de Facturación

    # ========================================================
    # MÓDULO DE PLANEACIÓN ESTRATÉGICA: MATRIZ DE 4 CARRILES
    # ========================================================
    scheduled_prod_mdf: Optional[datetime] = Field(default=None)    # PM: Fecha programada Producción MDF
    scheduled_prod_stone: Optional[datetime] = Field(default=None)  # PP: Fecha programada Producción Piedra
    scheduled_inst_mdf: Optional[datetime] = Field(default=None)    # IM: Fecha programada Instalación MDF
    scheduled_inst_stone: Optional[datetime] = Field(default=None)  # IP: Fecha programada Instalación Piedra

    # GARANTÍA Y CIERRE HISTÓRICO
    warranty_started_at: Optional[datetime] = Field(default=None)   # Timestamp de inicio de garantía (1 año)
    is_warranty_reopened: bool = Field(default=False)               # Instancia reabierta para garantía
    warranty_reopened_at: Optional[datetime] = Field(default=None)  # Cuando se reabrió
    original_signed_at: Optional[datetime] = Field(default=None)    # Snapshot del cierre original (historial)
    # ========================================================

    evidence_photos_urls: Optional[List[str]] = Field(
        default=None, sa_column=Column(JSON)
    )

    payment: Optional["CustomerPayment"] = Relationship(back_populates="instances_paid")
    item: Optional["SalesOrderItem"] = Relationship(back_populates="instances")

# ==========================================
# 4. MODELO DE PARTIDAS (NIVEL 2 - LA RECETA)
# ==========================================
class SalesOrderItem(SQLModel, table=True):
    __tablename__ = "sales_order_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    sales_order_id: int = Field(foreign_key="sales_orders.id")
    
    product_name: str
    origin_version_id: Optional[int] = Field(default=None) 
    
    quantity: float
    unit_price: float
    subtotal_price: float = Field(default=0.0)
    
    cost_snapshot: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON)) 
    frozen_unit_cost: float = Field(default=0.0)

    # ---> NUEVO SENSOR: FOTOGRAFÍA DE MATERIALES (JSON) <---
    # Ejemplo: {"MDF": 5000, "Granito": 12000, "Mano_Obra": 4000}
    category_breakdown_snapshot: Optional[str] = Field(default=None)

    order: Optional["SalesOrder"] = Relationship(back_populates="items")
    instances: List[SalesOrderItemInstance] = Relationship(
        back_populates="item", 
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

# ==========================================
# 5. MODELO DE CABECERA (NIVEL 1 - LA VENTA)
# ==========================================
class SalesOrder(SQLModel, table=True):
    __tablename__ = "sales_orders"

    id: Optional[int] = Field(default=None, primary_key=True)
    
    client_id: int = Field(foreign_key="clients_v2.id")
    tax_rate_id: int = Field(foreign_key="tax_rates.id")
    user_id: Optional[int] = Field(default=None, foreign_key="users.id") 
    
    client: Optional["Client"] = Relationship()
    user: Optional["User"] = Relationship()
    
    project_name: str = Field(index=True)
    status: SalesOrderStatus = Field(default=SalesOrderStatus.DRAFT)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    valid_until: datetime
    delivery_date: Optional[datetime] = None
    
    applied_margin_percent: float = Field(default=0.0)
    applied_tolerance_percent: float = Field(default=0.0)
    applied_commission_percent: float = Field(default=0.0)
    commission_amount: float = Field(default=0.0) 

    advance_percent: float = Field(default=60.0) 
    has_advance_invoice: bool = Field(default=False)
    currency: str = Field(default="MXN")
    
    # ========================================================
    # INYECCIÓN: RIESGO, MACROECONOMÍA Y PRESUPUESTO
    # ========================================================
    exchange_rate: Optional[float] = Field(default=1.0)
    estimated_installation_cost: Optional[float] = Field(default=0.0) 
    estimated_manufacturing_cost: Optional[float] = Field(default=0.0) 
    
    requires_director_approval: Optional[bool] = Field(default=False) # Semáforo Rojo
    is_approved_by_director: Optional[bool] = Field(default=False)
    director_approved_at: Optional[datetime] = Field(default=None)
    # ========================================================

    subtotal: float = Field(default=0.0)
    tax_amount: float = Field(default=0.0)
    total_price: float = Field(default=0.0)
    
    outstanding_balance: float = Field(default=0.0) 
    payment_status: PaymentStatus = Field(default=PaymentStatus.PENDING)

    notes: Optional[str] = None
    conditions: Optional[str] = None
    external_invoice_ref: Optional[str] = None
    is_warranty: bool = Field(default=False)

    # V5: Orden de compra del cliente (obligatoria al cerrar venta → WAITING_ADVANCE)
    client_po_folio: Optional[str] = Field(default=None, index=True)
    client_po_date: Optional[datetime] = Field(default=None)

    items: List[SalesOrderItem] = Relationship(
        back_populates="order", 
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    payments: List[CustomerPayment] = Relationship(
        back_populates="order",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )