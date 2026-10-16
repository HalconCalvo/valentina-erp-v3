import uuid
from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime, date
from zoneinfo import ZoneInfo

from app.core.deps import SessionDep, CurrentUser
from app.models.production import (
    InstallationAssignment,
    InstallationAssignmentStatus,
    PayrollPayment,
    PayrollStatus,
)
from app.models.sales import SalesOrderItemInstance, SalesOrderItem, SalesOrder
from app.models.foundations import Client
from app.models.users import User, UserRole
from app.services.cloud_storage import upload_to_gcs
from app.services import installation_service, installer_payroll_service, logistics_service
from app.core.permissions import allow, can_execute_payments, FIELD_ROLES, FINANCE_ROLES, INSTALLATION_ROLES
from app.core.audit_context import audit_reason
from app.schemas.logistics_schema import (
    TeamAgendaRead,
    DayTeamUpdate,
    AssignmentTeamUpdate,
)

router = APIRouter()
MERIDA_TZ = ZoneInfo("America/Merida")

AGENDA_ROLES = {
    UserRole.PRODUCTION,
    UserRole.DESIGN,
    UserRole.MANAGER,
    UserRole.DIRECTOR,
}


def _require_agenda_access(user: User) -> None:
    if user.role not in AGENDA_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Acceso restringido a la agenda de instalaciones.",
        )


def _upload_file_to_gcs(file_bytes: bytes, blob_name: str, content_type: str) -> str:
    """Adaptador sobre `upload_to_gcs` (espera un file-like), sin modificar cloud_storage."""
    url = upload_to_gcs(BytesIO(file_bytes), blob_name, content_type=content_type)
    if not url:
        raise RuntimeError("Fallo al subir el archivo a GCS.")
    return url


# ==========================================
# SCHEMAS
# ==========================================
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
    lane: Optional[str] = None
    admin_notes: Optional[str] = None
    days_waiting: int = 0
    bank_account_id: Optional[int] = None
    payment_method: Optional[str] = None

    class Config:
        from_attributes = True


class PayrollMarkPaidPayload(BaseModel):
    paid: bool
    bank_account_id: Optional[int] = None
    payment_method: Optional[str] = None  # D37: BANK (with bank_account_id) or CASH (petty cash)


class PayrollPayPersonPayload(BaseModel):
    """H66: every selected row of one person paid with one movement."""
    user_id: int
    payroll_ids: List[int]
    payment_method: str
    bank_account_id: Optional[int] = None


class PayrollDeferPayload(BaseModel):
    reason: str


class QRScanPayload(BaseModel):
    bundle_qr_uuid: str  # UUID del bulto escaneado


class ReasignarEquipoPayload(BaseModel):
    leader_user_id: int
    helper_1_user_id: Optional[int] = None
    helper_2_user_id: Optional[int] = None
    motivo: str


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
        lane=assignment.lane if assignment else None,
        admin_notes=getattr(r, "admin_notes", None),
        days_waiting=_days_waiting_logistics(r.created_at),
        bank_account_id=getattr(r, "bank_account_id", None),
        payment_method=r.payment_method,
    )


# ==========================================
# 2. TRABAJO TERMINADO Y FIRMA (D15: la firma crea la nómina de la cuadrilla)
# ==========================================
@router.patch("/equipos/{assignment_id}/firma", dependencies=[allow(FIELD_ROLES)])
def register_client_signature(assignment_id: int, payload: SignaturePayload, session: SessionDep):
    """Client's signature for the instance of this lane; Campo uses /field/instances/{id}/sync."""
    lane = session.get(InstallationAssignment, assignment_id)
    if not lane:
        raise HTTPException(status_code=404, detail="Asignación no encontrada.")
    return installation_service.sign_and_close(session, lane.instance_id, payload.signature_url)


@router.put("/assignments/{assignment_id}/mark-installed", dependencies=[allow(INSTALLATION_ROLES)])
def mark_assignment_installed(assignment_id: int, session: SessionDep):
    """The crew finished its (already loaded) lane: green 🟢, waiting for the signature."""
    return installation_service.mark_installed(session, assignment_id)


# ==========================================
# 3. BANDEJA DE NÓMINA (Gerencia / Admin)
# ==========================================
@router.get("/payroll/overview", response_model=InstallerPayrollOverview, dependencies=[allow(FINANCE_ROLES)])
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


@router.get("/payroll/", response_model=List[PayrollPaymentRead], dependencies=[allow(FINANCE_ROLES)])
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
    if current_user.role.upper() not in {"MANAGER", "DIRECTOR", "ADMIN"}:
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
    """(DIRECTOR; GERENCIA si está habilitada) Ejecuta el pago y opcionalmente registra salida bancaria."""
    if not can_execute_payments(session, current_user):
        raise HTTPException(status_code=403, detail="Solo Dirección ejecuta pagos (Gerencia, si Dirección lo habilita).")

    record = session.get(PayrollPayment, payroll_id)
    if not record:
        raise HTTPException(status_code=404, detail="Registro de nómina no encontrado.")

    if payload.paid:
        method = payload.payment_method or ("BANK" if payload.bank_account_id else None)
        return installer_payroll_service.pay_rows(session, current_user, [payroll_id], method, payload.bank_account_id)
    if record.status == PayrollStatus.PAID:
        raise HTTPException(status_code=409, detail="Un pago hecho no se regresa a Por pagar: se cancela su movimiento.")
    record.status, record.paid_at = PayrollStatus.READY_TO_PAY, None
    session.add(record)
    session.commit()
    return {"ok": True, "payroll_id": payroll_id, "status": record.status}


@router.post("/payroll/pay-person")
def pay_person_payroll(payload: PayrollPayPersonPayload, session: SessionDep, current_user: CurrentUser):
    """H66: pays every selected row of one person with ONE movement for the total (Banco or Efectivo, D37)."""
    if not can_execute_payments(session, current_user):
        raise HTTPException(status_code=403, detail="Solo Dirección ejecuta pagos (Gerencia, si Dirección lo habilita).")
    return installer_payroll_service.pay_rows(session, current_user, payload.payroll_ids, payload.payment_method,
                                              payload.bank_account_id, person_id=payload.user_id)


# ==========================================
# 4. CARGA DEL CAMIÓN (patio): escaneo del QR de un bulto de la casa
# ==========================================
@router.post("/assignments/{assignment_id}/preview-scan")
def preview_bundle_scan(assignment_id: int, payload: QRScanPayload, session: SessionDep, current_user: CurrentUser):
    """Step 1: what the leader must load for the scanned bundle (read only)."""
    return installation_service.preview_load(session, assignment_id, payload.bundle_qr_uuid, current_user)

@router.patch("/equipos/{assignment_id}/reasignar")
def reasignar_equipo(
    assignment_id: int,
    payload: ReasignarEquipoPayload,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Reasigna el equipo de una instalación ANTES de cargar (caso: el equipo asignado no asistió).
    Solo Jefe de Producción, Gerencia o Dirección.
    Bloqueado si la asignación ya fue procesada (la nómina ya se generó al escanear).
    """
    allowed = {UserRole.PRODUCTION, UserRole.MANAGER, UserRole.DIRECTOR}
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Solo el Jefe de Producción, Gerencia o Dirección pueden reasignar el equipo.",
        )

    if not (payload.motivo or "").strip():
        raise HTTPException(status_code=400, detail="Debe indicar el motivo de la reasignación.")

    assignment = session.get(InstallationAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada.")

    # Solo antes de la carga: después ya hay nómina generada y equipo confirmado
    if assignment.status != InstallationAssignmentStatus.SCHEDULED:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede reasignar: la carga ya fue procesada (status: {assignment.status}).",
        )

    # Validar usuarios
    nuevo_lider = session.get(User, payload.leader_user_id)
    if not nuevo_lider:
        raise HTTPException(status_code=404, detail="Usuario Líder no encontrado.")
    if payload.helper_1_user_id and not session.get(User, payload.helper_1_user_id):
        raise HTTPException(status_code=404, detail="Ayudante 1 no encontrado.")
    if payload.helper_2_user_id and not session.get(User, payload.helper_2_user_id):
        raise HTTPException(status_code=404, detail="Ayudante 2 no encontrado.")

    anterior = {
        "leader": assignment.leader_user_id,
        "helper_1": assignment.helper_1_user_id,
        "helper_2": assignment.helper_2_user_id,
    }

    assignment.leader_user_id = payload.leader_user_id
    assignment.helper_1_user_id = payload.helper_1_user_id
    assignment.helper_2_user_id = payload.helper_2_user_id
    session.add(assignment)

    # Si existieran registros de nómina previos en PENDING_SIGNATURE para esta asignación,
    # se anulan: la nómina correcta se generará al confirmar la carga con el equipo real.
    previos = session.exec(
        select(PayrollPayment).where(
            PayrollPayment.installation_assignment_id == assignment.id,
            PayrollPayment.status == PayrollStatus.PENDING_SIGNATURE,
        )
    ).all()
    anulados = 0
    with audit_reason(f"Cambio de equipo: {payload.motivo.strip()}"):
        for p in previos:
            p.status = PayrollStatus.CANCELLED
            p.admin_notes = "; ".join(x for x in (p.admin_notes, "Anulada por cambio de equipo") if x)
            session.add(p)
            anulados += 1
        session.flush()

    session.commit()
    session.refresh(assignment)

    return {
        "status": "success",
        "assignment_id": assignment.id,
        "equipo_anterior": anterior,
        "equipo_nuevo": {
            "leader": assignment.leader_user_id,
            "helper_1": assignment.helper_1_user_id,
            "helper_2": assignment.helper_2_user_id,
        },
        "nomina_previa_anulada": anulados,
        "motivo": payload.motivo.strip(),
        "reasignado_por": current_user.full_name or current_user.email,
    }

@router.post("/equipos/{assignment_id}/scan-qr")
def scan_bundle_qr(assignment_id: int, payload: QRScanPayload, session: SessionDep, current_user: CurrentUser):
    """Step 2: the assigned leader confirms the load (lane in progress, instance CARGADO); no payroll (D15)."""
    return installation_service.load_truck(session, assignment_id, payload.bundle_qr_uuid, current_user)


# ==========================================
# 5. EVIDENCIA FOTOGRÁFICA (iPad)
# ==========================================
@router.post("/instances/{instance_id}/evidence")
async def upload_evidence_photos(
    instance_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    photos: List[UploadFile] = File(...),
):
    """
    ENDPOINT PARA EL IPAD (rol LOGISTICS):
    Sube 1 o varias fotos de evidencia de una instalación.
    Las URLs se agregan (append) a evidence_photos_urls en SalesOrderItemInstance.
    No hay candado de tiempo — se pueden subir aunque la instancia ya esté CLOSED.
    """
    allowed_evidence = {UserRole.LOGISTICS, UserRole.DIRECTOR, UserRole.MANAGER}
    if current_user.role not in allowed_evidence:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para subir evidencia.",
        )

    instance = session.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")

    # Subir cada foto a GCS y recopilar URLs
    uploaded_urls = []
    errors = []
    for photo in photos:
        try:
            ext = photo.filename.rsplit(".", 1)[-1].lower() if photo.filename and "." in photo.filename else "jpg"
            blob_name = f"evidence/instance_{instance_id}/{uuid.uuid4().hex}.{ext}"
            contents = await photo.read()
            url = _upload_file_to_gcs(
                contents,
                blob_name,
                photo.content_type or "image/jpeg",
            )
            uploaded_urls.append(url)
        except Exception as e:
            errors.append({"filename": photo.filename, "error": str(e)})

    if not uploaded_urls and errors:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo subir ninguna foto. Errores: {errors}",
        )

    current_urls = instance.evidence_photos_urls or []
    instance.evidence_photos_urls = current_urls + uploaded_urls
    session.add(instance)
    session.commit()
    session.refresh(instance)

    return {
        "instance_id": instance_id,
        "instance_name": instance.custom_name,
        "uploaded_count": len(uploaded_urls),
        "failed_count": len(errors),
        "uploaded_urls": uploaded_urls,
        "errors": errors if errors else None,
        "total_evidence_photos": len(instance.evidence_photos_urls or []),
    }


# ==========================================
# 5b. AGENDA POR EQUIPOS (planeación diaria)
# ==========================================
@router.get("/team-agenda", response_model=TeamAgendaRead)
def get_team_agenda(
    workday: date,
    session: SessionDep,
    current_user: CurrentUser,
):
    _require_agenda_access(current_user)
    data = logistics_service.get_team_agenda(session, workday)
    return TeamAgendaRead(
        workday=workday,
        teams=data["teams"],
        unassigned=data["unassigned"],
    )


@router.patch("/team-agenda/day-team")
def patch_day_team(
    payload: DayTeamUpdate,
    session: SessionDep,
    current_user: CurrentUser,
):
    _require_agenda_access(current_user)
    try:
        updated = logistics_service.update_day_team_for_leader(
            session,
            {
                "workday": payload.workday,
                "previous_leader_id": payload.previous_leader_id,
                "leader_user_id": payload.leader_user_id,
                "helper_1_user_id": payload.helper_1_user_id,
                "helper_2_user_id": payload.helper_2_user_id,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"updated_assignments": updated}


@router.patch("/assignments/{assignment_id}/team")
def patch_assignment_team(
    assignment_id: int,
    payload: AssignmentTeamUpdate,
    session: SessionDep,
    current_user: CurrentUser,
):
    _require_agenda_access(current_user)
    try:
        logistics_service.update_assignment_team(
            session,
            assignment_id,
            payload.model_dump(),
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"ok": True, "assignment_id": assignment_id}


# ==========================================
# 6. FEED DEL DÍA — Jornada del líder (iPad)
# ==========================================
@router.get("/my-workday")
def get_my_workday(
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Feed de instalación: LOGISTICS ve sus asignaciones como líder (hoy y el siguiente día hábil, D32);
    DIRECTOR / GERENCIA ven todas las asignaciones en curso (sin filtro de fecha).
    """
    allowed = {UserRole.LOGISTICS, UserRole.DIRECTOR, UserRole.MANAGER}
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Acceso restringido al módulo de instalación.",
        )

    workday = datetime.now(MERIDA_TZ).date()
    day_start, day_end = logistics_service.loading_window(workday)

    if current_user.role == UserRole.LOGISTICS:
        stmt = select(InstallationAssignment).where(
            InstallationAssignment.leader_user_id == current_user.id,
            InstallationAssignment.assignment_date >= day_start,
            InstallationAssignment.assignment_date <= day_end,
            InstallationAssignment.status.in_([
                InstallationAssignmentStatus.SCHEDULED,
                InstallationAssignmentStatus.IN_PROGRESS,
                InstallationAssignmentStatus.INSTALLED,
                InstallationAssignmentStatus.COMPLETED,
            ]),
        )
    else:
        stmt = select(InstallationAssignment).where(
            InstallationAssignment.status.in_([
                InstallationAssignmentStatus.SCHEDULED,
                InstallationAssignmentStatus.IN_PROGRESS,
                InstallationAssignmentStatus.INSTALLED,
                InstallationAssignmentStatus.COMPLETED,
            ]),
        )
    assignments = session.exec(stmt).all()

    workday_items = []
    for assignment in assignments:
        instance = session.get(SalesOrderItemInstance, assignment.instance_id)
        if not instance:
            continue

        item = session.get(SalesOrderItem, instance.sales_order_item_id)
        order = session.get(SalesOrder, item.sales_order_id) if item else None
        client = session.get(Client, order.client_id) if order and order.client_id else None

        helper_1 = session.get(User, assignment.helper_1_user_id) if assignment.helper_1_user_id else None
        helper_2 = session.get(User, assignment.helper_2_user_id) if assignment.helper_2_user_id else None
        leader = session.get(User, assignment.leader_user_id)

        st = assignment.status.value if hasattr(assignment.status, "value") else str(assignment.status)

        workday_items.append({
            "assignment_id": assignment.id,
            "assignment_status": st,
            "lane": assignment.lane,
            "assignment_date": assignment.assignment_date.isoformat()
            if assignment.assignment_date else None,
            "instance_id": instance.id,
            "instance_name": instance.custom_name,
            "instance_status": instance.production_status,
            "order_folio": f"OV-{str(order.id).zfill(4)}" if order else None,
            "project_name": order.project_name if order else None,
            "client_name": client.full_name if client else None,
            "client_address": " · ".join(x for x in (instance.street, instance.lot) if x)
            or (client.fiscal_address if client else None),  # the house (street, lot) first
            "leader_name": leader.full_name if leader else None,
            "evidence_photos_count": len(instance.evidence_photos_urls or []),
            "has_signature": bool(assignment.client_signature_url),
            "all_lanes_installed": installation_service.all_lanes_installed(session, assignment.instance_id),
            "team": {
                "leader": {"id": assignment.leader_user_id, "name": leader.full_name if leader else None},
                "helper_1": {"id": helper_1.id, "name": helper_1.full_name} if helper_1 else None,
                "helper_2": {"id": helper_2.id, "name": helper_2.full_name} if helper_2 else None,
            },
            "started_at": assignment.started_at.isoformat() if assignment.started_at else None,
            "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None,
        })

    return {
        "workday": workday.isoformat(),
        "next_workday": logistics_service.next_business_day(workday).isoformat(),
        "leader": {"id": current_user.id, "name": current_user.full_name},
        "total_assignments": len(workday_items),
        "items": workday_items,
    }
