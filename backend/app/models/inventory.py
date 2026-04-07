from datetime import datetime
from typing import List, Optional, TYPE_CHECKING
from sqlmodel import Field, Relationship, SQLModel

# Usamos TYPE_CHECKING para evitar importaciones circulares en tiempo de ejecución
if TYPE_CHECKING:
    from .foundations import Provider 
    from .material import Material

class InventoryReceptionBase(SQLModel):
    provider_id: int = Field(foreign_key="providers.id")
    invoice_number: str = Field(index=True) # Folio Factura
    invoice_date: datetime 
    reception_date: datetime = Field(default_factory=datetime.now)
    total_amount: float # Monto total de la factura
    notes: Optional[str] = None
    status: str = Field(default="COMPLETED") # COMPLETED, CANCELLED

class InventoryReception(InventoryReceptionBase, table=True):
    __tablename__ = "inventory_receptions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relaciones
    transactions: List["InventoryTransaction"] = Relationship(back_populates="reception")


class InventoryTransactionBase(SQLModel):
    reception_id: Optional[int] = Field(default=None, foreign_key="inventory_receptions.id")
    material_id: int = Field(foreign_key="materials.id")
    
    quantity: float # Cantidad que entra (+) o sale (-)
    unit_cost: float # Costo calculado al momento
    subtotal: float # Costo total de la línea
    
    transaction_type: str = Field(default="PURCHASE_ENTRY") # ENTRADA_COMPRA
    
    # ========================================================
    # INYECCIÓN V4.0: RASTREO DE MERMAS, CALIDAD Y AUDITORÍAS
    # ========================================================
    # Apunta a sales_orders.id para cargarle el costo a un proyecto específico
    project_id: Optional[int] = Field(default=None, index=True) 
    operator_badge: Optional[str] = Field(default=None) # Gafete de quien rompió/pidió la pieza
    reason_code: Optional[str] = Field(default=None) # Ej: MERMA, NO_CALIDAD, AJUSTE_AUDITORIA, SURTIDO_KITTING
    # ========================================================
    
    created_at: datetime = Field(default_factory=datetime.now)

class InventoryTransaction(InventoryTransactionBase, table=True):
    __tablename__ = "inventory_transactions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Relaciones
    reception: Optional[InventoryReception] = Relationship(back_populates="transactions")


# ==========================================
# TABLAS V3.5 (COMPRAS Y APARTADOS)
# ==========================================

class InventoryReservation(SQLModel, table=True):
    __tablename__ = "inventory_reservations"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    production_batch_id: int = Field(foreign_key="production_batches.id")
    material_id: int = Field(foreign_key="materials.id")
    quantity_reserved: float
    status: str = Field(default="ACTIVA")  # ACTIVA, CONSUMIDA, CANCELADA
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PurchaseRequisition(SQLModel, table=True):
    __tablename__ = "purchase_requisitions"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    material_id: Optional[int] = Field(default=None, foreign_key="materials.id")
    custom_description: Optional[str] = None 
    requested_quantity: float
    status: str = Field(default="PENDIENTE")  # PENDIENTE, EN_COMPRA, APLAZADA, PROCESADA
    requested_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PurchaseOrder(SQLModel, table=True):
    __tablename__ = "purchase_orders"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    provider_id: int = Field(foreign_key="providers.id")
    folio: str = Field(index=True)
    status: str = Field(default="BORRADOR")  
    invoice_folio_reported: Optional[str] = Field(default=None)
    invoice_total_reported: Optional[float] = Field(default=None)
    
    payment_status: str = Field(default="PENDING") 
    is_advance: bool = Field(default=True) 

    total_estimated_amount: float = Field(default=0.0)
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    
    # ---> ¡AQUÍ ESTÁ EL CAMPO RESCATADO! <---
    approved_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    
    authorized_by: Optional[str] = Field(default=None) 
    authorized_at: Optional[datetime] = Field(default=None)
    exchange_rate: Optional[float] = Field(default=1.0)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PurchaseOrderItem(SQLModel, table=True):
    __tablename__ = "purchase_order_items"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    purchase_order_id: int = Field(foreign_key="purchase_orders.id")
    
    material_id: Optional[int] = Field(default=None, foreign_key="materials.id")
    custom_description: Optional[str] = None 
    
    quantity_ordered: float
    expected_unit_cost: float
    quantity_received: float = Field(default=0.0) # Para gestión de entradas parciales


# ==========================================
# NUEVAS TABLAS V4.0 (ALMACÉN Y WMS)
# ==========================================

# ------------------------------------------
# A. SURTIDO POR INSTANCIA (KITTING)
# ------------------------------------------
class InventoryDispatch(SQLModel, table=True):
    """Cabecera del Ticket de Surtido (La Caja Física para la Instancia)"""
    __tablename__ = "inventory_dispatches"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # EL REY: Apunta directo a la Instancia (sales_order_item_instances)
    instance_id: int = Field(index=True) 
    production_batch_id: Optional[int] = Field(default=None, index=True)
    
    scheduled_date: datetime # La fecha de los -3 Días
    actual_dispatch_date: Optional[datetime] = None
    
    status: str = Field(default="PENDIENTE") # PENDIENTE, ARMANDO_KIT, LISTO_PARA_ENTREGA, ENTREGADA
    
    # El almacenista que armó la caja
    warehouse_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryDispatchItem(SQLModel, table=True):
    """Checklist de materiales exactos adentro de la Caja"""
    __tablename__ = "inventory_dispatch_items"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    dispatch_id: int = Field(foreign_key="inventory_dispatches.id")
    material_id: int = Field(foreign_key="materials.id")
    
    required_quantity: float # Lo que exige la Receta (BOM)
    picked_quantity: float = Field(default=0.0) # Lo que el almacenista realmente metió
    
    status: str = Field(default="PENDIENTE") # PENDIENTE, SURTIDO, FALTANTE


# ------------------------------------------
# B. AUDITORÍAS Y CIERRE CONTABLE CIEGO
# ------------------------------------------
class InventoryAudit(SQLModel, table=True):
    """Documento Oficial de Conteo Físico"""
    __tablename__ = "inventory_audits"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    scheduled_date: datetime = Field(default_factory=datetime.utcnow)
    
    status: str = Field(default="EN_CAPTURA") # EN_CAPTURA, ESPERANDO_AUTORIZACION, CERRADA, RECHAZADA
    
    auditor_id: Optional[int] = Field(default=None, foreign_key="users.id") # El que cuenta
    authorized_by_id: Optional[int] = Field(default=None, foreign_key="users.id") # El Director que aprueba el ajuste
    
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryAuditItem(SQLModel, table=True):
    """Líneas de conteo individual por material (Captura Ciega)"""
    __tablename__ = "inventory_audit_items"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    audit_id: int = Field(foreign_key="inventory_audits.id")
    material_id: int = Field(foreign_key="materials.id")
    
    system_quantity: float # Lo que dice Valentina que hay (Oculto al usuario)
    counted_quantity: Optional[float] = Field(default=None) # Lo que el humano teclea
    variance: Optional[float] = Field(default=None) # Diferencia calculada (+/-)