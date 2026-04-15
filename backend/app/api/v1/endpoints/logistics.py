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
from app.models.treasury import BankAccount, BankTransaction, TransactionType
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
    admin_notes: Optional[str] = None
    days_waiting: int = 0
    bank_account_id: Optional[int] = None

    class Config:
        from_attributes = True


class PayrollMarkPaidPayload(BaseModel):
    paid: bool
    bank_account_id: Optional[int] = None


class PayrollDeferPayload(BaseModel):
    reason: str


class InstallerPayrollOverview(BaseModel):
    retained_total: float
    payable_total: float
    paid_total: float
    deferred_total: float
    retained: List[PayrollPaymentRead]
    payable: List[PayrollPaymentRead]
    paid: List[PayrollPaymentRead]
    deferred: List[PayrollPaymentRead]


def _days_waiting_logistics(reference: Optional[datetime]) -> int:
    if not reference:
        return 0
    now = datetime.utcnow()
    ref = reference.replace(tzinfo=None) if getattr(reference, "tzinfo", None) else reference
    return max(0, (now - ref).days)


def _serialize_payroll_row(r: PayrollPayment, session: Session) -> PayrollPaymentRead:
    user = session.get(User, r.user_id)
    assignment = session.get(InstallationAssignment, r.installation_assignment_id)
    instance = session.get(SalesOrderItemInstance, assignment.instance_id) if assignment else None
    st = r.status.value if hasattr(r.status, "value") else str(r.status)
    return PayrollPaymentRead(
        id=r.id,
        installation_assignment_id=r.installation_assignment_id,
        user_id=r.user_id,
        user_name=user.full_name if user else None,
        payment_type=r.payment_type.value if hasattr(r.payment_type, "value") else str(r.payment_type),
        days_worked=r.days_worked,
        daily_rate=r.daily_rate,
        total_amount=r.total_amount,
        status=st,
        created_at=r.created_at,
        paid_at=r.paid_at,
        instance_name=instance.custom_name if instance else None,
        admin_notes=getattr(r, "admin_notes", None),
        days_waiting=_days_waiting_logistics(r.created_at),
        bank_account_id=getattr(r, "bank_account_id", None),
    )


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
@router.get("/payroll/overview", response_model=InstallerPayrollOverview)
def get_installer_payroll_overview(session: SessionDep):
    """
    Tres bandejas independientes (totales sin duplicar):
    Retenidas = sin firma; Por pagar = READY_TO_PAY; Pagadas = PAID.
    DEFERRED se excluye de Por pagar (aparece sólo si se consulta historial vía lista filtrada).
    """
    all_rows = session.exec(select(PayrollPayment).order_by(PayrollPayment.created_at.desc())).all()
    retained, payable, paid, deferred = [], [], [], []
    for r in all_rows:
        st = r.status.value if hasattr(r.status, "value") else str(r.status)
        row = _serialize_payroll_row(r, session)
        if st == PayrollStatus.PENDING_SIGNATURE.value:
            retained.append(row)
        elif st == PayrollStatus.READY_TO_PAY.value:
            payable.append(row)
        elif st == PayrollStatus.PAID.value:
            paid.append(row)
        elif st == PayrollStatus.DEFERRED.value:
            deferred.append(row)
    return InstallerPayrollOverview(
        retained_total=sum(x.total_amount for x in retained),
        payable_total=sum(x.total_amount for x in payable),
        paid_total=sum(x.total_amount for x in paid),
        deferred_total=sum(x.total_amount for x in deferred),
        retained=retained,
        payable=payable,
        paid=paid,
        deferred=deferred,
    )


@router.get("/payroll/", response_model=List[PayrollPaymentRead])
def get_payroll_payments(
    session: SessionDep,
    payroll_status: Optional[str] = None,
    user_id: Optional[int] = None,
):
    """
    Lista todos los registros de nómina a destajo.
    Filtros: status (PENDING_SIGNATURE | READY_TO_PAY | PAID | DEFERRED), user_id.
    """
    query = select(PayrollPayment)
    if payroll_status:
        try:
            ps = PayrollStatus(payroll_status)
        except ValueError:
            ps = payroll_status
        query = query.where(PayrollPayment.status == ps)
    if user_id:
        query = query.where(PayrollPayment.user_id == user_id)

    records = session.exec(query.order_by(PayrollPayment.created_at.desc())).all()
    return [_serialize_payroll_row(r, session) for r in records]


@router.patch("/payroll/{payroll_id}/defer")
def defer_installer_payroll(
    payroll_id: int,
    payload: PayrollDeferPayload,
    session: SessionDep,
    current_user: CurrentUser,
):
    """Omite el pago esta semana — requiere motivo documentado."""
    if current_user.role.upper() not in {"GERENCIA", "DIRECTOR", "ADMIN"}:
        raise HTTPException(status_code=403, detail="Solo Gerencia, Director o Admin.")
    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=422, detail="Debes escribir el motivo antes de omitir el pago.")
    record = session.get(PayrollPayment, payroll_id)
    if not record:
        raise HTTPException(status_code=404, detail="Registro no encontrado.")
    if record.status != PayrollStatus.READY_TO_PAY:
        raise HTTPException(status_code=400, detail="Solo se puede omitir desde la bandeja Por Pagar.")
    record.status = PayrollStatus.DEFERRED
    record.admin_notes = payload.reason.strip()
    session.add(record)
    session.commit()
    return {"ok": True, "payroll_id": payroll_id, "status": record.status}


@router.patch("/payroll/{payroll_id}/mark-paid")
def mark_payroll_paid(
    payroll_id: int,
    payload: PayrollMarkPaidPayload,
    session: SessionDep,
    current_user: CurrentUser,
):
    """(GERENCIA / DIRECTOR / ADMIN) Ejecuta el pago y opcionalmente registra salida bancaria."""
    if current_user.role.upper() not in {"GERENCIA", "DIRECTOR", "ADMIN"}:
        raise HTTPException(status_code=403, detail="Solo Gerencia, Director o Admin pueden ejecutar pagos.")

    record = session.get(PayrollPayment, payroll_id)
    if not record:
        raise HTTPException(status_code=404, detail="Registro de nómina no encontrado.")

    if payload.paid:
        if record.status != PayrollStatus.READY_TO_PAY:
            raise HTTPException(status_code=400, detail="Solo se pagan registros en READY_TO_PAY.")
        if payload.bank_account_id:
            account = session.get(BankAccount, payload.bank_account_id)
            if not account:
                raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada.")
            if account.current_balance < record.total_amount:
                raise HTTPException(status_code=400, detail="Saldo insuficiente en la cuenta seleccionada.")
            tx = BankTransaction(
                account_id=account.id,
                transaction_type=TransactionType.OUT,
                amount=record.total_amount,
                reference=f"Destajo nómina #{record.id}",
                description="Pago instalador (destajo)",
                related_entity_type="PAYROLL_PAYMENT",
                related_entity_id=record.id,
            )
            session.add(tx)
            account.current_balance -= record.total_amount
            session.add(account)
            record.bank_account_id = payload.bank_account_id
        record.status = PayrollStatus.PAID
        record.paid_at = datetime.utcnow()
    else:
        record.status = PayrollStatus.READY_TO_PAY
        record.paid_at = None

    session.add(record)
    session.commit()
    return {"ok": True, "payroll_id": payroll_id, "status": record.status}
