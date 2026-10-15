"""Installation of an instance, lane by lane (IM furniture, IP stone): load the truck in the yard, install, sign.

Roles of each place (Gabriel, 2026-10-12; Logística is no longer a module: Planning decides dates and crew):
- Field loads the truck by scanning the QR of a bundle of that house (Carga del camión): the lane goes SCHEDULED →
  IN_PROGRESS, the instance READY → CARGADO and its material moves to cost of sales.
- Field (the site) records evidence, marks each loaded lane as installed and takes the client's signature.
- D15: crew payroll is created only by the client's signature (READY_TO_PAY). Neither the assignment nor the load
  creates it, and invoicing does not release it.
"""
from datetime import datetime, timedelta
from io import BytesIO
import base64
import uuid
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core.permissions import role_of
from app.models.production import (InstallationAssignment, InstallationAssignmentStatus, PayrollPayment,
                                   PayrollPaymentType, PayrollStatus, ProductionBatch, ProductionBatchStatus)
from app.models.sales import InstanceStatus, SalesOrderItemInstance
from app.models.users import User
from app.repositories import installation_repository as repo
from app.services import production_inventory_service
from app.services.cloud_storage import upload_to_gcs
from app.services.planning_service import trigger_double_green

PREVIEW_ROLES = {"LOGISTICS", "DIRECTOR", "MANAGER", "PRODUCTION"}
LOAD_ROLES = {"LOGISTICS", "DIRECTOR", "MANAGER"}
DEFAULT_LEADER_RATE = 800.0
DEFAULT_HELPER_RATE = 700.0
WARRANTY_DAYS = 365
SHORT_CODE_LENGTH = 8  # characters of the instance QR printed on each label
STONE_LANE = "IP"
INSTALLATION_SKU = {"IM": "INSTALACOCINA", "IP": "INSTALAGRANITO"}  # D18: recipe line in days, per lane
FALLBACK_DAYS = 1.0
LOADABLE_INSTANCE = {InstanceStatus.READY, InstanceStatus.CARGADO}  # CARGADO: the other lane already left
BATCH_IN_FACTORY = {ProductionBatchStatus.PLANNED, ProductionBatchStatus.DRAFT, ProductionBatchStatus.ON_HOLD,
                    ProductionBatchStatus.IN_PRODUCTION}


def _get_lane(session: Session, assignment_id: int) -> InstallationAssignment:
    lane = session.get(InstallationAssignment, assignment_id)
    if not lane or lane.status == InstallationAssignmentStatus.CANCELLED:
        raise HTTPException(status_code=404, detail="Asignación no encontrada.")
    return lane


def _get_instance(session: Session, instance_id: int) -> SalesOrderItemInstance:
    instance = session.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")
    return instance


def bundle_counts(instance: SalesOrderItemInstance) -> tuple:
    """Bundles declared when packing (the labels are printed from them): (MDF, hardware)."""
    return int(instance.mdf_bundles or 0), int(instance.hardware_bundles or 0)


def _same_house(instance: SalesOrderItemInstance, code: str) -> bool:
    return len(code) >= SHORT_CODE_LENGTH and instance.qr_code.lower().startswith(code)


def check_bundle_code(instance: SalesOrderItemInstance, code: str, lane: str = "IM") -> int:
    """Furniture: each bundle QR carries '<instance QR>-<bundle number>'; stone: the trip manifest carries the
    instance QR. Typed by hand, the short code printed on the label is enough. Returns the bundle number (0 for the
    stone manifest) or rejects the code."""
    if not instance.qr_code:
        raise HTTPException(status_code=409, detail="Esta casa no tiene etiquetas generadas; pídelas en Empaque.")
    typed = (code or "").strip().lower()
    if lane == STONE_LANE and _same_house(instance, typed):
        return 0
    prefix, _, number = typed.rpartition("-")
    total = sum(bundle_counts(instance))
    if not _same_house(instance, prefix) or not number.isdigit() or not 1 <= int(number) <= max(total, 1):
        raise HTTPException(status_code=422, detail="El código no es de un bulto de esta casa.")
    return int(number)


def _load_block(session: Session, lane: InstallationAssignment, instance: SalesOrderItemInstance) -> Optional[str]:
    """A lane loads when its house is ready (or already left with the other lane) and its own batch left the factory."""
    if lane.status != InstallationAssignmentStatus.SCHEDULED:
        return "Esta asignación ya fue cargada."
    if instance.production_status not in LOADABLE_INSTANCE:
        return "La casa todavía no está lista en Producción."
    batch_id = instance.stone_batch_id if lane.lane == STONE_LANE else instance.production_batch_id
    batch = session.get(ProductionBatch, batch_id) if batch_id else None
    if batch and batch.status in BATCH_IN_FACTORY:
        kind = "piedra" if lane.lane == STONE_LANE else "muebles"
        return f"El lote de {kind} ({batch.folio}) todavía está en producción."
    return None


def _load_counts(lane: InstallationAssignment, instance: SalesOrderItemInstance) -> dict:
    if lane.lane == STONE_LANE:
        pieces = int(instance.stone_pieces or 0)
        return {"bultos_mdf": 0, "bultos_herrajes": 0, "piezas_piedra": pieces, "bultos_total": pieces}
    mdf, hardware = bundle_counts(instance)
    return {"bultos_mdf": mdf, "bultos_herrajes": hardware, "piezas_piedra": 0, "bultos_total": mdf + hardware}


def _crew_names(session: Session, lane: InstallationAssignment) -> List[str]:
    users = [session.get(User, uid) for uid in (lane.leader_user_id, lane.helper_1_user_id, lane.helper_2_user_id) if uid]
    return [u.full_name for u in users if u and u.full_name]


def preview_load(session: Session, assignment_id: int, code: str, user) -> dict:
    """Read only: what the leader must load for the scanned bundle. Changes nothing."""
    if role_of(user) not in PREVIEW_ROLES:
        raise HTTPException(status_code=403, detail="No tienes permiso para escanear cargas.")
    lane = _get_lane(session, assignment_id)
    instance = _get_instance(session, lane.instance_id)
    bundle = check_bundle_code(instance, code, lane.lane)
    order, client = repo.get_order_and_client(session, instance)
    is_leader = user.id == lane.leader_user_id
    block = _load_block(session, lane, instance)
    return {
        "assignment_id": lane.id, "instance_id": instance.id, "instance_name": instance.custom_name,
        "lane": lane.lane, "cliente": getattr(client, "full_name", None) if client else None,
        "proyecto": order.project_name if order else None, "bulto": bundle, **_load_counts(lane, instance),
        "equipo_asignado": _crew_names(session, lane), "es_lider_asignado": is_leader,
        "requiere_autorizacion": not is_leader, "bloqueo": block, "puede_confirmar": block is None and is_leader,
    }


def load_truck(session: Session, assignment_id: int, code: str, user) -> dict:
    """The assigned leader confirms the load with a bundle of the house. No payroll is created here (D15)."""
    if role_of(user) not in LOAD_ROLES:
        raise HTTPException(status_code=403, detail="Solo el equipo de instalación puede escanear QRs.")
    lane = _get_lane(session, assignment_id)
    if user.id != lane.leader_user_id:
        raise HTTPException(status_code=403, detail="Solo el Líder asignado puede confirmar la carga al camión.")
    instance = _get_instance(session, lane.instance_id)
    bundle = check_bundle_code(instance, code, lane.lane)
    block = _load_block(session, lane, instance)
    if block:
        raise HTTPException(status_code=400, detail=block)
    now = datetime.utcnow()
    lane.status, lane.started_at = InstallationAssignmentStatus.IN_PROGRESS, now
    instance.production_status = InstanceStatus.CARGADO
    instance.current_location = "En Tránsito (Camión)"
    session.add_all([lane, instance])
    moved = production_inventory_service.transfer_instance_to_cogs(session, instance.id, user)
    session.commit()
    return {"message": "🔵🔵 Carga confirmada. La casa va en camino.", "assignment_id": lane.id,
            "instance_id": instance.id, "instance_name": instance.custom_name, "bulto": bundle,
            "instance_status": instance.production_status, "scanned_at": now.isoformat(),
            "inventory_consumed": moved}


def mark_installed(session: Session, assignment_id: int) -> dict:
    """The crew finished its lane at the site; only a loaded lane can be installed."""
    lane = _get_lane(session, assignment_id)
    if lane.status != InstallationAssignmentStatus.IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Solo se marca terminado un carril ya cargado en Logística "
                                                    "y que no esté terminado.")
    lane.status = InstallationAssignmentStatus.INSTALLED
    session.add(lane)
    session.commit()
    return {"ok": True, "assignment_id": lane.id, "status": "INSTALLED",
            "message": "🟢 Trabajo terminado. Esperando firma del cliente."}


def missing_lanes(session: Session, instance: SalesOrderItemInstance) -> List[str]:
    """Lanes the recipe needs (furniture, stone) that have no crew assigned yet."""
    assigned = {lane.lane for lane in repo.get_lanes(session, instance.id)}
    return sorted(repo.get_required_lanes(session, instance) - assigned)


def all_lanes_installed(session: Session, instance_id: int) -> bool:
    """Every lane the house needs is assigned and finished (a kitchen with stone is not received without it)."""
    instance = session.get(SalesOrderItemInstance, instance_id)
    lanes = repo.get_open_lanes(session, instance_id)
    if not instance or not lanes or missing_lanes(session, instance):
        return False
    return all(lane.status == InstallationAssignmentStatus.INSTALLED for lane in lanes)


def store_signature(instance_id: int, signature: str) -> str:
    """A drawn signature (data URL) goes to storage; an existing URL is kept as is."""
    if not signature.startswith("data:"):
        return signature
    try:
        raw = base64.b64decode(signature.split(",", 1)[-1])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Firma inválida.") from exc
    url = upload_to_gcs(BytesIO(raw), f"field/instance_{instance_id}/signature_{uuid.uuid4().hex}.png", "image/png")
    if not url:
        raise HTTPException(status_code=500, detail="No se pudo guardar la firma.")
    return url


def _payroll_row(lane, user_id: int, kind: PayrollPaymentType, days: float, rate: float,
                 note: Optional[str]) -> PayrollPayment:
    return PayrollPayment(installation_assignment_id=lane.id, user_id=user_id, payment_type=kind,
                          days_worked=days, daily_rate=rate, total_amount=round(days * rate, 2),
                          status=PayrollStatus.READY_TO_PAY, admin_notes=note)


def lane_installation_days(session: Session, lane: InstallationAssignment,
                           instance: SalesOrderItemInstance) -> tuple:
    """D18: days of the lane's installation line in the recipe (INSTALACOCINA furniture, INSTALAGRANITO stone).
    A recipe without it pays 1 day and the payroll says so, so Design corrects the recipe."""
    sku = INSTALLATION_SKU.get(lane.lane, INSTALLATION_SKU["IM"])
    days = repo.get_recipe_installation_days(session, instance, sku)
    if days:
        return float(days), None
    return FALLBACK_DAYS, f"La receta no tiene la línea {sku} en días: se tomó 1 día. Diseño debe corregir la receta."


def create_crew_payroll(session: Session, lane: InstallationAssignment, instance: SalesOrderItemInstance) -> int:
    """D15: the signature releases the crew's pay (days of the lane's installation line × daily rate); once per lane."""
    if repo.get_live_payroll(session, lane.id):
        return 0
    config = repo.get_global_config(session)
    leader_rate = config.default_leader_daily_rate if config else DEFAULT_LEADER_RATE
    helper_rate = config.default_helper_daily_rate if config else DEFAULT_HELPER_RATE
    days, note = lane_installation_days(session, lane, instance)
    rows = [_payroll_row(lane, lane.leader_user_id, PayrollPaymentType.LEADER, days, leader_rate, note)]
    rows += [_payroll_row(lane, uid, PayrollPaymentType.HELPER, days, helper_rate, note)
             for uid in (lane.helper_1_user_id, lane.helper_2_user_id) if uid]
    session.add_all(rows)
    return len(rows)


def sign_and_close(session: Session, instance_id: int, signature: str) -> dict:
    """Client's signature of receipt: completes every installed lane, closes the instance (warranty, commissions)
    and creates the crew payroll ready to pay."""
    instance = _get_instance(session, instance_id)
    if not all_lanes_installed(session, instance.id):
        raise HTTPException(status_code=409, detail="La firma va después de marcar el trabajo terminado "
                                                    "en todos los carriles de la casa.")
    url, now = store_signature(instance.id, signature), datetime.utcnow()
    payroll = 0
    for lane in repo.get_open_lanes(session, instance.id):
        lane.status, lane.client_signature_url, lane.completed_at = InstallationAssignmentStatus.COMPLETED, url, now
        lane.warranty_end_date = now + timedelta(days=WARRANTY_DAYS)
        session.add(lane)
        payroll += create_crew_payroll(session, lane, instance)
    instance.current_location = "Instalado en Obra"
    trigger_double_green(instance, session, signed_at=now)
    session.commit()
    return {"message": "🟢🟢 Firma recabada. Casa cerrada y nómina de la cuadrilla lista para pago.",
            "instance_id": instance.id, "payroll_created": payroll, "signed_at": now.isoformat(),
            "warranty_end_date": (now + timedelta(days=WARRANTY_DAYS)).isoformat()}
