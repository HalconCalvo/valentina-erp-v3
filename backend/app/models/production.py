from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, JSON

# ==========================================
# 1. LOTES DE PRODUCCIÓN (FÁBRICA)
# ==========================================
class ProductionBatch(SQLModel, table=True):
    __tablename__ = "production_batches"

    id: Optional[int] = Field(default=None, primary_key=True)
    folio: str = Field(index=True, unique=True)
    batch_type: str = Field(default="STANDARD")
    status: str = Field(default="PLANNED")
    estimated_merma_percent: float = Field(default=0.0)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")

    # ========================================================
    # INYECCIÓN: CHOQUE DE TRENES Y EFICIENCIA DE FÁBRICA
    # ========================================================
    scheduled_start_date: Optional[datetime] = Field(default=None) # Para el Gantt
    scheduled_end_date: Optional[datetime] = Field(default=None) # Para el Gantt
    
    started_at: Optional[datetime] = Field(default=None) # Cronómetro Real
    completed_at: Optional[datetime] = Field(default=None) # Cronómetro Real
    
    actual_merma_percent: Optional[float] = Field(default=None) # Merma real final
    actual_payroll_cost: Optional[float] = Field(default=0.0) # Nómina absorbida
    actual_overhead_cost: Optional[float] = Field(default=0.0) # Gastos fijos absorbidos
    # ========================================================


# ==========================================
# 2. ASIGNACIONES DE INSTALACIÓN (OBRA)
# ==========================================
class InstallationAssignment(SQLModel, table=True):
    __tablename__ = "installation_assignments"

    id: Optional[int] = Field(default=None, primary_key=True)
    instance_id: int = Field(index=True) # Ligado a sales_order_item_instances.id
    assignment_date: datetime
    
    leader_user_id: int = Field(foreign_key="users.id")
    helper_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    
    status: str = Field(default="SCHEDULED")
    
    # Evidencias
    client_signature_url: Optional[str] = Field(default=None)
    evidence_photos_urls: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # ========================================================
    # INYECCIÓN: TESORERÍA, GARANTÍAS Y RENTABILIDAD EN OBRA
    # ========================================================
    started_at: Optional[datetime] = Field(default=None)
    completed_at: Optional[datetime] = Field(default=None)
    
    actual_installation_cost: Optional[float] = Field(default=0.0) # Viáticos, compras extra en ruta
    warranty_end_date: Optional[datetime] = Field(default=None) # Responsabilidad post-venta
    
    installer_pay_amount: Optional[float] = Field(default=0.0) # Lo pactado a pagar a la cuadrilla
    is_pay_settled: Optional[bool] = Field(default=False) # Si Gerencia ya ejecutó el pago a destajo
    # ========================================================