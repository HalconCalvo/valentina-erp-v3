from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime, date

from app.core.deps import SessionDep, CurrentUser
from app.models.logistics import InstallationAssignment
from app.models.production import PayrollPayment, PayrollPaymentType, PayrollStatus
from app.models.sales import SalesOrderItemInstance, SalesOrderItem, InstanceStatus
from app.models.design import ProductVersion
from app.models.foundations import GlobalConfig
from app.models.users import User
from app.services.planning_service import trigger_double_green

router = APIRouter()

# ==========================================
# SCHEMAS
# ==========================================
class CrewAssignmentPayload(BaseModel):
    instance_id: int
    leader_user_id: int
    helper_user_id: Optional[int] = None
    assignment_date: Optional[date] = None


class SignaturePayload(BaseModel):
    signature_url: str


class PayrollPaymentRead(BaseModel):
    id: int
    installation_assignment_id: int
    user_id: int
    user_name: Optional[str] = None
    payment_type: str
    days_worked: float
    daily_rate: float
    total_amount: float
    status: str
    created_at: datetime
    paid_at: Optional[datetime] = None
    instance_name: Optional[str] = None

    class Config:
        from_attributes = True


class PayrollMarkPaidPayload(BaseModel):
    paid: bool


# ==========================================
# HELPER INTERNO
# ==========================================
def _get_installation_days(session: SessionDep, instance: SalesOrderItemInstance) -> float:
    """Sube la cadena Instance → Item → ProductVersion para obtener los días presupuestados."""
    item = session.get(SalesOrderItem, instance.sales_order_item_id)
    if not item or not item.origin_version_id:
        return 1.0
    version = session.get(ProductVersion, item.origin_version_id)
    return float(version.installation_days) if version and version.installation_days else 1.0


# ==========================================
# 1. PASE DE LISTA — Asignación de Cuadrilla
# ==========================================
@router.post("/equipos/", response_model=InstallationAssignment, status_code=status.HTTP_201_CREATED)
def asignar_cuadrilla(
    payload: CrewAssignmentPayload,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    (ADMIN / DISEÑO / GERENCIA / DIRECTOR)
    Pase de Lista oficial. Asigna Líder + Ayudante a una instancia,
    genera los registros de nómina en PENDING_SIGNATURE y marca CARGADO.
    """
    allowed = {"ADMIN", "DESIGN", "GERENCIA", "DIRECTOR"}
    if current_user.role.upper() not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo ADMIN, DISEÑO, GERENCIA o DIRECTOR pueden asignar cuadrillas.",
        )

    instance = session.get(SalesOrderItemInstance, payload.instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")
    if instance.production_status not in [InstanceStatus.READY, InstanceStatus.CARGADO]:
        raise HTTPException(
            status_code=400,
            detail=f"Bloqueo Logístico: el material no está listo. Estatus actual: {instance.production_status}",
        )

    if not session.get(User, payload.leader_user_id):
        raise HTTPException(status_code=404, detail="Usuario Líder no encontrado.")
    if payload.helper_user_id and not session.get(User, payload.helper_user_id):
        raise HTTPException(status_code=404, detail="Usuario Ayudante no encontrado.")

    # Leer tabulador global
    config = session.exec(select(GlobalConfig)).first()
    leader_rate = config.default_leader_daily_rate if config else 800.0
    helper_rate = config.default_helper_daily_rate if config else 700.0

    # Días de instalación de la receta
    installation_days = _get_installation_days(session, instance)

    # Crear la asignación
    assignment = InstallationAssignment(
        instance_id=payload.instance_id,
        leader_user_id=payload.leader_user_id,
        helper_user_id=payload.helper_user_id,
        assignment_date=datetime.combine(payload.assignment_date or date.today(), datetime.min.time()),
        status="EN_TRANSITO",
    )
    session.add(assignment)
    session.flush()  # necesitamos el ID para los registros de nómina

    # Registro de nómina — Líder
    session.add(PayrollPayment(
        installation_assignment_id=assignment.id,
        user_id=payload.leader_user_id,
        payment_type=PayrollPaymentType.LEADER,
        days_worked=installation_days,
        daily_rate=leader_rate,
        total_amount=round(installation_days * leader_rate, 2),
        status=PayrollStatus.PENDING_SIGNATURE,
    ))

    # Registro de nómina — Ayudante (si aplica)
    if payload.helper_user_id:
        session.add(PayrollPayment(
            installation_assignment_id=assignment.id,
            user_id=payload.helper_user_id,
            payment_type=PayrollPaymentType.HELPER,
            days_worked=installation_days,
            daily_rate=helper_rate,
            total_amount=round(installation_days * helper_rate, 2),
            status=PayrollStatus.PENDING_SIGNATURE,
        ))

    # Marcar instancia como CARGADO
    instance.production_status = InstanceStatus.CARGADO
    instance.current_location = "En Tránsito (Camión)"
    session.add(instance)

    session.commit()
    session.refresh(assignment)
    return assignment


# ==========================================
# 2. GATILLO DE FIRMA — Libera nómina a READY_TO_PAY
# ==========================================
@router.patch("/equipos/{assignment_id}/firma")
def register_client_signature(
    assignment_id: int,
    payload: SignaturePayload,
    session: SessionDep,
):
    """
    ENDPOINT PARA EL IPAD: recaba la firma digital del cliente.
    - Cierra la instancia con signed_received_at (activa la garantía de 1 año).
    - Libera todos los registros de nómina de esta asignación a READY_TO_PAY.
    """
    assignment = session.get(InstallationAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada.")

    now = datetime.utcnow()

    assignment.client_signature_url = payload.signature_url
    assignment.status = "FINALIZADO_CON_FIRMA"
    assignment.completed_at = now
    assignment.warranty_end_date = datetime(now.year + 1, now.month, now.day)
    session.add(assignment)

    # Disparar el Evento Maestro Doble Verde 🟢🟢
    # → cambia a CLOSED, registra signed_received_at, libera nómina a READY_TO_PAY
    double_green_result = {"payroll_released": [], "instance_id": None}
    instance = session.get(SalesOrderItemInstance, assignment.instance_id)
    if instance:
        instance.current_location = "Instalado en Obra"
        session.add(instance)
        double_green_result = trigger_double_green(instance, session, signed_at=now)

    session.commit()
    session.refresh(assignment)
    return {
        "message": "🟢🟢 Firma recabada. Instancia cerrada. Nómina liberada. Aviso a Administración activado.",
        "assignment_id": assignment.id,
        "instance_id": double_green_result.get("instance_id"),
        "payroll_released": len(double_green_result.get("payroll_released", [])),
        "warranty_end_date": str(assignment.warranty_end_date),
        "admin_notification": "Instancia finalizada. Proceder con facturación de avance.",
    }


# ==========================================
# 3. BANDEJA DE NÓMINA (Gerencia / Admin)
# ==========================================
@router.get("/payroll/", response_model=List[PayrollPaymentRead])
def get_payroll_payments(
    session: SessionDep,
    payroll_status: Optional[str] = None,
    user_id: Optional[int] = None,
):
    """
    Lista todos los registros de nómina a destajo.
    Filtros: status (PENDING_SIGNATURE | READY_TO_PAY | PAID), user_id.
    """
    query = select(PayrollPayment)
    if payroll_status:
        query = query.where(PayrollPayment.status == payroll_status)
    if user_id:
        query = query.where(PayrollPayment.user_id == user_id)

    records = session.exec(query.order_by(PayrollPayment.created_at.desc())).all()

    results = []
    for r in records:
        user = session.get(User, r.user_id)
        assignment = session.get(InstallationAssignment, r.installation_assignment_id)
        instance = session.get(SalesOrderItemInstance, assignment.instance_id) if assignment else None
        results.append(PayrollPaymentRead(
            id=r.id,
            installation_assignment_id=r.installation_assignment_id,
            user_id=r.user_id,
            user_name=user.full_name if user else None,
            payment_type=r.payment_type,
            days_worked=r.days_worked,
            daily_rate=r.daily_rate,
            total_amount=r.total_amount,
            status=r.status,
            created_at=r.created_at,
            paid_at=r.paid_at,
            instance_name=instance.custom_name if instance else None,
        ))
    return results


@router.patch("/payroll/{payroll_id}/mark-paid")
def mark_payroll_paid(
    payroll_id: int,
    payload: PayrollMarkPaidPayload,
    session: SessionDep,
    current_user: CurrentUser,
):
    """(GERENCIA / DIRECTOR / ADMIN) Ejecuta el pago de un registro de nómina."""
    if current_user.role.upper() not in {"GERENCIA", "DIRECTOR", "ADMIN"}:
        raise HTTPException(status_code=403, detail="Solo Gerencia, Director o Admin pueden ejecutar pagos.")

    record = session.get(PayrollPayment, payroll_id)
    if not record:
        raise HTTPException(status_code=404, detail="Registro de nómina no encontrado.")

    record.status = PayrollStatus.PAID if payload.paid else PayrollStatus.READY_TO_PAY
    record.paid_at = datetime.utcnow() if payload.paid else None
    session.add(record)
    session.commit()
    return {"ok": True, "payroll_id": payroll_id, "status": record.status}
