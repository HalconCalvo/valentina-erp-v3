from typing import List, Optional, Dict, Any
from sqlmodel import SQLModel
from datetime import datetime
from app.models.sales import SalesOrderStatus

# ==========================================
# 1. PARTIDAS (Items de la Orden)
# ==========================================
class SalesOrderItemBase(SQLModel):
    product_name: str
    origin_version_id: Optional[int] = None
    quantity: int = 1
    unit_price: float
    
    # El Snapshot se puede enviar desde el frontend o calcular en backend
    cost_snapshot: Dict[str, Any] = {} 
    frozen_unit_cost: float = 0.0

class SalesOrderItemCreate(SalesOrderItemBase):
    pass

class SalesOrderItemRead(SalesOrderItemBase):
    id: int
    sales_order_id: int
    subtotal_price: float 

# ==========================================
# 2. ORDEN DE VENTA (Cabecera)
# ==========================================
class SalesOrderBase(SQLModel):
    project_name: str
    client_id: int
    tax_rate_id: int
    
    valid_until: datetime
    delivery_date: Optional[datetime] = None
    
    # Reglas de Negocio
    applied_margin_percent: float
    applied_tolerance_percent: float
    applied_commission_percent: float = 0.0 
    
    currency: str = "MXN"
    notes: Optional[str] = None      
    conditions: Optional[str] = None 
    external_invoice_ref: Optional[str] = None
    is_warranty: bool = False

# INPUT: Para crear una orden nueva
class SalesOrderCreate(SalesOrderBase):
    items: List[SalesOrderItemCreate] = []

# OUTPUT: Para leer una orden
class SalesOrderRead(SalesOrderBase):
    id: int
    status: SalesOrderStatus
    created_at: datetime
    
    subtotal: float
    tax_amount: float
    total_price: float
    
    # --- ¡ESTA ES LA SOLUCIÓN! ---
    # Agregamos este campo para que el Frontend sepa quién creó la orden
    user_id: Optional[int] = None 
    
    items: List[SalesOrderItemRead] = []

# OUTPUT: Para actualizar estatus o datos
class SalesOrderUpdate(SQLModel):
    # Datos Generales
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
    
    # Datos Financieros
    applied_margin_percent: Optional[float] = None
    applied_commission_percent: Optional[float] = None
    
    # Totales
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    total_price: Optional[float] = None

    items: Optional[List[SalesOrderItemCreate]] = None