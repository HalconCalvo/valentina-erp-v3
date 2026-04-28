import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime, date

from app.core.deps import SessionDep, CurrentUser
from app.models.production import (
    InstallationAssignment,
    InstallationAssignmentStatus,
    PayrollPayment,
    PayrollPaymentType,
    PayrollStatus,
)
from app.models.sales import SalesOrderItemInstance, SalesOrderItem, SalesOrder, InstanceStatus
from app.models.design import ProductVersion
from app.models.foundations import GlobalConfig, Client
from app.models.users import User, UserRole
from app.models.treasury import BankAccount, BankTransaction, TransactionType
from app.models.inventory import InventoryReservation
from app.models.material import Material
from app.services.planning_service import trigger_double_green
from app.services.cloud_storage import upload_to_gcs

router = APIRouter()


def _check_all_lanes_installed(instance_id: int, session: Session) -> bool:
    """
    Retorna True si TODOS los carriles activos de la instancia
    están en estado INSTALLED o COMPLETED.
    Retorna False si algún carril está en SCHEDULED, IN_PROGRESS o CARGADO.
    """
    assignments = session.exec(
        select(InstallationAssignment).where(
            InstallationAssignment.instance_id == instance_id,
            InstallationAssignment.status != InstallationAssignmentStatus.COMPLETED
        )
    ).all()

    if not assignments:
        return False

    return all(
        a.status in [
            InstallationAssignmentStatus.INSTALLED,
            InstallationAssignmentStatus.COMPLETED,
        ]
        for a in assignments
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
class CrewAssignmentPayload(BaseModel):
    instance_id: int
    leader_user_id: int
    helper_1_user_id: Optional[int] = None
    helper_2_user_id: Optional[int] = None
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


class QRScanPayload(BaseModel):
    bundle_qr_uuid: str  # UUID del bulto escaneado


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
    if payload.helper_1_user_id and not session.get(User, payload.helper_1_user_id):
        raise HTTPException(status_code=404, detail="Ayudante 1 no encontrado.")
    if payload.helper_2_user_id and not session.get(User, payload.helper_2_user_id):
        raise HTTPException(status_code=404, detail="Ayudante 2 no encontrado.")

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
        helper_1_user_id=payload.helper_1_user_id,
        helper_2_user_id=payload.helper_2_user_id,
        assignment_date=datetime.combine(
            payload.assignment_date or date.today(), datetime.min.time()
        ),
        status=InstallationAssignmentStatus.SCHEDULED,
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

    # Registro de nómina — Ayudantes (si aplica)
    if payload.helper_1_user_id:
        session.add(PayrollPayment(
            installation_assignment_id=assignment.id,
            user_id=payload.helper_1_user_id,
            payment_type=PayrollPaymentType.HELPER,
            days_worked=installation_days,
            daily_rate=helper_rate,
            total_amount=round(installation_days * helper_rate, 2),
            status=PayrollStatus.PENDING_SIGNATURE,
        ))
    if payload.helper_2_user_id:
        session.add(PayrollPayment(
            installation_assignment_id=assignment.id,
            user_id=payload.helper_2_user_id,
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
    current_user: CurrentUser,
):
    """
    ENDPOINT PARA EL IPAD: recaba la firma digital del cliente.
    - Cierra la instancia con signed_received_at (activa la garantía de 1 año).
    - Libera todos los registros de nómina de esta asignación a READY_TO_PAY.
    """
    assignment = session.get(InstallationAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada.")

    if not _check_all_lanes_installed(assignment.instance_id, session):
        raise HTTPException(
            status_code=400,
            detail="No se puede firmar hasta que todos los carriles estén marcados como instalados."
        )

    now = datetime.utcnow()

    assignment.client_signature_url = payload.signature_url
    assignment.status = InstallationAssignmentStatus.COMPLETED
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


@router.put("/assignments/{assignment_id}/mark-installed")
def mark_assignment_installed(
    assignment_id: int,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    El instalador marca su carril como terminado físicamente.
    Verde Simple 🟢 — trabajo hecho, esperando firma.
    Cualquier usuario autenticado puede ejecutar este endpoint.
    """
    assignment = session.get(InstallationAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada.")

    if assignment.status not in [
        InstallationAssignmentStatus.IN_PROGRESS,
        InstallationAssignmentStatus.SCHEDULED,
    ]:
        raise HTTPException(
            status_code=400,
            detail="Solo se puede marcar como instalado desde SCHEDULED o IN_PROGRESS."
        )

    assignment.status = InstallationAssignmentStatus.INSTALLED
    session.add(assignment)
    session.commit()
    session.refresh(assignment)

    return {
        "ok": True,
        "assignment_id": assignment_id,
        "status": "INSTALLED",
        "message": "🟢 Trabajo terminado. Esperando firma del cliente."
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


# ==========================================
# 4. ESCANEO QR — Confirmar carga al camión (iPad)
# ==========================================
@router.post("/equipos/{assignment_id}/scan-qr")
def scan_bundle_qr(
    assignment_id: int,
    payload: QRScanPayload,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    ENDPOINT PARA EL IPAD (Líder LOGISTICS):
    El líder escanea el QR de un bulto al subir al camión.
    - Confirma el equipo definitivo
    - Cambia el status de la instancia a CARGADO (doble azul 🔵🔵)
    - Genera los registros de nómina con el equipo confirmado
    - A partir de aquí el equipo ya no puede modificarse
    """
    allowed_scan = {UserRole.LOGISTICS, UserRole.DIRECTOR, UserRole.GERENCIA}
    if current_user.role not in allowed_scan:
        raise HTTPException(
            status_code=403,
            detail="Solo el equipo de instalación puede escanear QRs.",
        )

    assignment = session.get(InstallationAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada.")

    if assignment.status != InstallationAssignmentStatus.SCHEDULED:
        raise HTTPException(
            status_code=400,
            detail=f"Esta asignación ya fue procesada. Status actual: {assignment.status}",
        )

    # Verificar que quien escanea es el líder asignado
    if current_user.id != assignment.leader_user_id:
        raise HTTPException(
            status_code=403,
            detail="Solo el Líder asignado puede confirmar la carga al camión.",
        )

    instance = session.get(SalesOrderItemInstance, assignment.instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")

    if instance.production_status not in [InstanceStatus.READY]:
        raise HTTPException(
            status_code=400,
            detail=f"Bloqueo Logístico: la instancia debe estar en READY para cargarse. "
                   f"Status actual: {instance.production_status}",
        )

    now = datetime.utcnow()

    # Confirmar equipo y marcar IN_PROGRESS
    assignment.status = InstallationAssignmentStatus.IN_PROGRESS
    assignment.started_at = now
    session.add(assignment)

    # Cambiar instancia a CARGADO 🔵🔵
    instance.production_status = InstanceStatus.CARGADO
    instance.current_location = "En Tránsito (Camión)"
    session.add(instance)

    # ── BAJA CONTABLE DE INVENTARIO ──────────────────────────
    # Regla inmutable: la baja ocurre al escanear QR (CARGADO)
    # Se consumen las reservas ACTIVA de esta instancia
    reservations = session.exec(
        select(InventoryReservation).where(
            InventoryReservation.instance_id == instance.id,
            InventoryReservation.status == "ACTIVA",
        )
    ).all()

    for res in reservations:
        # Baja contable: reducir stock físico
        material = session.get(Material, res.material_id)
        if material:
            material.physical_stock = max(
                0.0,
                (material.physical_stock or 0.0) - res.quantity_reserved
            )
            # Liberar committed_stock
            material.committed_stock = max(
                0.0,
                (material.committed_stock or 0.0) - res.quantity_reserved
            )
            session.add(material)

        # Marcar reserva como consumida
        res.status = "CONSUMIDA"
        session.add(res)
    # ─────────────────────────────────────────────────────────

    # Leer tabulador global
    config = session.exec(select(GlobalConfig)).first()
    leader_rate = config.default_leader_daily_rate if config else 800.0
    helper_rate = config.default_helper_daily_rate if config else 700.0

    # Días de instalación de la receta
    installation_days = _get_installation_days(session, instance)

    # Generar nómina con el equipo DEFINITIVO confirmado en este momento
    session.add(PayrollPayment(
        installation_assignment_id=assignment.id,
        user_id=assignment.leader_user_id,
        payment_type=PayrollPaymentType.LEADER,
        days_worked=installation_days,
        daily_rate=leader_rate,
        total_amount=round(installation_days * leader_rate, 2),
        status=PayrollStatus.PENDING_SIGNATURE,
    ))
    if assignment.helper_1_user_id:
        session.add(PayrollPayment(
            installation_assignment_id=assignment.id,
            user_id=assignment.helper_1_user_id,
            payment_type=PayrollPaymentType.HELPER,
            days_worked=installation_days,
            daily_rate=helper_rate,
            total_amount=round(installation_days * helper_rate, 2),
            status=PayrollStatus.PENDING_SIGNATURE,
        ))
    if assignment.helper_2_user_id:
        session.add(PayrollPayment(
            installation_assignment_id=assignment.id,
            user_id=assignment.helper_2_user_id,
            payment_type=PayrollPaymentType.HELPER,
            days_worked=installation_days,
            daily_rate=helper_rate,
            total_amount=round(installation_days * helper_rate, 2),
            status=PayrollStatus.PENDING_SIGNATURE,
        ))

    session.commit()
    session.refresh(assignment)

    leader = session.get(User, assignment.leader_user_id)
    return {
        "message": "🔵🔵 Bulto confirmado. Instancia en tránsito al cliente.",
        "assignment_id": assignment.id,
        "instance_id": instance.id,
        "instance_name": instance.custom_name,
        "bundle_qr_uuid": payload.bundle_qr_uuid,
        "instance_status": instance.production_status,
        "leader": {"id": assignment.leader_user_id, "name": leader.full_name if leader else None},
        "payroll_records_created": 1 + bool(assignment.helper_1_user_id) + bool(assignment.helper_2_user_id),
        "scanned_at": now.isoformat(),
        "inventory_consumed": len(reservations),
    }


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
    allowed_evidence = {UserRole.LOGISTICS, UserRole.DIRECTOR, UserRole.GERENCIA}
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
# 6. FEED DEL DÍA — Jornada del líder (iPad)
# ==========================================
@router.get("/my-workday")
def get_my_workday(
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Feed de instalación: LOGISTICS ve sus asignaciones como líder (hoy);
    DIRECTOR / GERENCIA ven todas las asignaciones en curso (sin filtro de fecha).
    """
    allowed = {UserRole.LOGISTICS, UserRole.DIRECTOR, UserRole.GERENCIA}
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Acceso restringido al módulo de instalación.",
        )

    workday = date.today()
    day_start = datetime.combine(workday, datetime.min.time())
    day_end = datetime.combine(workday, datetime.max.time())

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
            "client_address": client.fiscal_address if client else None,
            "leader_name": leader.full_name if leader else None,
            "evidence_photos_count": len(instance.evidence_photos_urls or []),
            "has_signature": bool(assignment.client_signature_url),
            "all_lanes_installed": _check_all_lanes_installed(
                assignment.instance_id, session
            ),
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
        "leader": {"id": current_user.id, "name": current_user.full_name},
        "total_assignments": len(workday_items),
        "items": workday_items,
    }
