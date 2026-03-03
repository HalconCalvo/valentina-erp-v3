from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship, Column, JSON
import enum

# ==========================================
# 1. ENUMS (REGLAS DE NEGOCIO Y ESTATUS)
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

class InstanceStatus(str, enum.Enum):
    PENDING = "PENDING"             # Gris: Esperando ser liberado a producción
    IN_PRODUCTION = "IN_PRODUCTION" # Azul: En piso de fábrica (Lote en proceso)
    READY = "READY"                 # Azul/Verde: Terminado en fábrica, esperando camión
    CARGADO = "CARGADO"             # Trigger Financiero: Custodia en tránsito (Descuenta Stock)
    INSTALLED = "INSTALLED"         # Azul: Instalado en obra, falta firma de conformidad
    CLOSED = "CLOSED"               # Verde: Firma recabada (Libera Cobro y Nómina)

# ==========================================
# 2. MODELO DE COBROS (TESORERÍA EN VENTAS)
# ==========================================
class CustomerPayment(SQLModel, table=True):
    __tablename__ = "customer_payments"

    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relación con la Orden de Venta
    sales_order_id: int = Field(foreign_key="sales_orders.id")
    
    amount: float
    payment_date: datetime = Field(default_factory=datetime.utcnow)
    payment_method: PaymentMethod = Field(default=PaymentMethod.TRANSFERENCIA)
    
    reference: Optional[str] = None 
    notes: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by_user_id: int # El usuario que registró el pago
    
    # Relación inversa
    order: Optional["SalesOrder"] = Relationship(back_populates="payments")

# ==========================================
# 3. MODELO DE INSTANCIAS (NIVEL 3 - EL ÁTOMO)
# ==========================================
class SalesOrderItemInstance(SQLModel, table=True):
    __tablename__ = "sales_order_item_instances"

    id: Optional[int] = Field(default=None, primary_key=True)
    sales_order_item_id: int = Field(foreign_key="sales_order_items.id")
    
    # Identificación y Trazabilidad (El Bautizo)
    custom_name: str = Field(index=True)  # Ej. "Cocina Casa 32" (Antes identifier_name)
    production_status: InstanceStatus = Field(default=InstanceStatus.PENDING)
    
    # Candado RTM y Fábrica
    production_batch_id: Optional[int] = Field(default=None) # Llave foránea futura a production_batches.id
    is_cancelled: bool = Field(default=False) # Botón de pánico individual
    
    qr_code: Optional[str] = Field(default=None, unique=True, index=True) 
    current_location: Optional[str] = Field(default="Planeación") 
    
    # Relación inversa
    item: Optional["SalesOrderItem"] = Relationship(back_populates="instances")

# ==========================================
# 4. MODELO DE PARTIDAS (NIVEL 2 - LA RECETA)
# ==========================================
class SalesOrderItem(SQLModel, table=True):
    __tablename__ = "sales_order_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    sales_order_id: int = Field(foreign_key="sales_orders.id")
    
    # Identificación
    product_name: str
    origin_version_id: Optional[int] = Field(default=None) 
    
    # Valores
    quantity: float
    unit_price: float
    subtotal_price: float = Field(default=0.0)
    
    # Ingeniería de Costos (Finanzas Blindadas)
    cost_snapshot: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON)) 
    frozen_unit_cost: float = Field(default=0.0)

    # Relaciones Bidireccionales corregidas
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
    
    # Llaves Foráneas
    client_id: int = Field(foreign_key="clients_v2.id")
    tax_rate_id: int = Field(foreign_key="tax_rates.id")
    user_id: Optional[int] = Field(default=None, foreign_key="users.id") 
    
    # Datos Generales
    project_name: str = Field(index=True)
    status: SalesOrderStatus = Field(default=SalesOrderStatus.DRAFT)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    valid_until: datetime
    delivery_date: Optional[datetime] = None
    
    # Financiero Venta
    applied_margin_percent: float = Field(default=0.0)
    applied_tolerance_percent: float = Field(default=0.0)
    applied_commission_percent: float = Field(default=0.0)
    commission_amount: float = Field(default=0.0) 

    currency: str = Field(default="MXN")
    
    # Totales
    subtotal: float = Field(default=0.0)
    tax_amount: float = Field(default=0.0)
    total_price: float = Field(default=0.0)
    
    # Cuentas por Cobrar
    outstanding_balance: float = Field(default=0.0) 
    payment_status: PaymentStatus = Field(default=PaymentStatus.PENDING)

    # Extras
    notes: Optional[str] = None
    conditions: Optional[str] = None
    external_invoice_ref: Optional[str] = None
    is_warranty: bool = Field(default=False)

    # Relaciones Bidireccionales corregidas
    items: List[SalesOrderItem] = Relationship(
        back_populates="order", 
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    payments: List[CustomerPayment] = Relationship(
        back_populates="order",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )