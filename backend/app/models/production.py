from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from sqlmodel import SQLModel, Field, Column, JSON

# ==========================================
# ENUMS DE NÓMINA
# ==========================================
class PayrollStatus(str, Enum):
    PENDING_SIGNATURE = "PENDING_SIGNATURE"  # Cuadrilla en obra, esperando firma
    READY_TO_PAY = "READY_TO_PAY"            # Firma recibida — listo para viernes
    PAID = "PAID"                             # Gerencia ejecutó el pago
    DEFERRED = "DEFERRED"                     # Omitido esta quincena (requiere motivo en admin_notes)

class PayrollPaymentType(str, Enum):
    LEADER = "LEADER"
    HELPER = "HELPER"

# ==========================================
# 1. LOTES DE PRODUCCIÓN (FÁBRICA)
# ==========================================
class ProductionBatchStatus(str, Enum):
    """Estados del lote en piso de fábrica (valores en inglés)."""
    PLANNED = "PLANNED"
    DRAFT = "DRAFT"
    ON_HOLD = "ON_HOLD"
    IN_PRODUCTION = "IN_PRODUCTION"
    PACKING = "PACKING"
    READY_TO_INSTALL = "READY_TO_INSTALL"
    FINISHED = "FINISHED"


class ProductionBatch(SQLModel, table=True):
    __tablename__ = "production_batches"

    id: Optional[int] = Field(default=None, primary_key=True)
    folio: str = Field(index=True, unique=True)
    batch_type: str = Field(default="STANDARD")
    status: ProductionBatchStatus = Field(default=ProductionBatchStatus.PLANNED)
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
class InstallationAssignmentStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


class InstallationAssignment(SQLModel, table=True):
    __tablename__ = "installation_assignments"

    id: Optional[int] = Field(default=None, primary_key=True)
    instance_id: int = Field(index=True) # Ligado a sales_order_item_instances.id
    lane: str = Field(default="IM")  # "IM" o "IP"
    assignment_date: datetime
    
    leader_user_id: int = Field(foreign_key="users.id")
    helper_1_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    helper_2_user_id: Optional[int] = Field(default=None, foreign_key="users.id")

    status: InstallationAssignmentStatus = Field(default=InstallationAssignmentStatus.SCHEDULED)
    
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
    
    installer_pay_amount: Optional[float] = Field(default=0.0)
    is_pay_settled: Optional[bool] = Field(default=False)
    # ========================================================


# ==========================================
# 3. NÓMINA A DESTAJO (REGISTRO DE PAGO)
# ==========================================
class PayrollPayment(SQLModel, table=True):
    __tablename__ = "payroll_payments"

    id: Optional[int] = Field(default=None, primary_key=True)
    installation_assignment_id: int = Field(foreign_key="installation_assignments.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    payment_type: PayrollPaymentType  # LEADER o HELPER

    days_worked: float        # Días de instalación de la receta (snapshot)
    daily_rate: float         # Tarifa del tabulador vigente (snapshot)
    total_amount: float       # days_worked * daily_rate

    status: PayrollStatus = Field(default=PayrollStatus.PENDING_SIGNATURE)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = Field(default=None)

    admin_notes: Optional[str] = Field(default=None)
    bank_account_id: Optional[int] = Field(default=None, foreign_key="bank_accounts.id")