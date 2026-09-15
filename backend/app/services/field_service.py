import base64
import uuid
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlmodel import Session, select, or_

from app.models.design import ProductVersion, VersionComponent
from app.models.foundations import Client
from app.models.material import Material
from app.models.production import InstallationAssignment
from app.models.sales import SalesOrder, SalesOrderItem, SalesOrderItemInstance
from app.models.users import User, UserRole
from app.schemas.field_schema import (
    FieldAssignmentRead,
    FieldClientBrief,
    FieldComponentsGroup,
    FieldMaterialLine,
    FieldMyAssignmentsRead,
    FieldSalesOrderBrief,
    FieldScanPackageRead,
    FieldSyncPayload,
    FieldSyncRead,
)
from app.services.cloud_storage import upload_to_gcs

MX_TZ = ZoneInfo("America/Mexico_City")
FIELD_ROLES = {
    UserRole.LOGISTICS,
    UserRole.PRODUCTION,
    UserRole.DESIGN,
    UserRole.MANAGER,
    UserRole.DIRECTOR,
}


def assert_field_role(user: User) -> None:
    if user.role not in FIELD_ROLES:
        raise HTTPException(status_code=403, detail="Acceso restringido al módulo Campo.")


def _today_mexico() -> date:
    return datetime.now(MX_TZ).date()


def _utc_window_for_mexico_day() -> Tuple[datetime, datetime]:
    start_local = datetime.now(MX_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def _install_type(inst: SalesOrderItemInstance, start_utc: datetime, end_utc: datetime) -> Optional[str]:
    mdf = inst.scheduled_inst_mdf and start_utc <= inst.scheduled_inst_mdf < end_utc
    stone = inst.scheduled_inst_stone and start_utc <= inst.scheduled_inst_stone < end_utc
    if mdf and stone:
        return "BOTH"
    if mdf:
        return "MDF"
    if stone:
        return "STONE"
    return None


def _leader_for_lane(session: Session, inst: SalesOrderItemInstance, lane: str) -> Optional[int]:
    if lane == "IM" and inst.leader_mdf_id:
        return inst.leader_mdf_id
    if lane == "IP" and inst.leader_stone_id:
        return inst.leader_stone_id
    row = session.exec(
        select(InstallationAssignment).where(
            InstallationAssignment.instance_id == inst.id,
            InstallationAssignment.lane == lane,
        )
    ).first()
    return row.leader_user_id if row else None


def _user_leads_today(session: Session, user_id: int, inst: SalesOrderItemInstance, start_utc: datetime, end_utc: datetime) -> bool:
    kind = _install_type(inst, start_utc, end_utc)
    if kind in ("MDF", "BOTH") and _leader_for_lane(session, inst, "IM") == user_id:
        return True
    if kind in ("STONE", "BOTH") and _leader_for_lane(session, inst, "IP") == user_id:
        return True
    return False


def _components_for_version(session: Session, version_id: Optional[int]) -> FieldComponentsGroup:
    empaque: List[FieldMaterialLine] = []
    herrajes: List[FieldMaterialLine] = []
    if not version_id:
        return FieldComponentsGroup(empaque=empaque, herrajes=herrajes)
    rows = session.exec(
        select(VersionComponent).where(VersionComponent.version_id == version_id)
    ).all()
    for comp in rows:
        mat = session.get(Material, comp.material_id)
        if not mat:
            continue
        ctype = "HERRAJE" if (mat.category or "").upper() == "HERRAJE" else "EMPAQUE"
        line = FieldMaterialLine(
            quantity=float(comp.quantity or 0),
            unit=mat.usage_unit or "",
            name=mat.name,
            type=ctype,
        )
        if ctype == "HERRAJE":
            herrajes.append(line)
        else:
            empaque.append(line)
    return FieldComponentsGroup(empaque=empaque, herrajes=herrajes)


def _serialize_instance(session: Session, inst: SalesOrderItemInstance, start_utc: datetime, end_utc: datetime) -> FieldAssignmentRead:
    item = session.get(SalesOrderItem, inst.sales_order_item_id)
    order = session.get(SalesOrder, item.sales_order_id) if item else None
    client = session.get(Client, order.client_id) if order and order.client_id else None
    version_id = item.origin_version_id if item else None
    blueprint_path = None
    if version_id:
        version = session.get(ProductVersion, version_id)
        blueprint_path = version.blueprint_path if version else None
    folio = f"OV-{str(order.id).zfill(4)}" if order else "—"
    status = inst.production_status.value if hasattr(inst.production_status, "value") else str(inst.production_status)
    return FieldAssignmentRead(
        id=inst.id,
        custom_name=inst.custom_name,
        street=inst.street,
        lot=inst.lot,
        production_status=status,
        sales_order=FieldSalesOrderBrief(folio=folio, project_name=order.project_name if order else None),
        client=FieldClientBrief(business_name=getattr(client, "business_name", None) if client else None),
        type=_install_type(inst, start_utc, end_utc) or "MDF",
        blueprint_path=blueprint_path,
        components=_components_for_version(session, version_id),
        evidence_photos_urls=list(inst.evidence_photos_urls or []),
        signed_received_at=inst.signed_received_at.isoformat() if inst.signed_received_at else None,
    )


def get_my_assignments(session: Session, user: User) -> FieldMyAssignmentsRead:
    assert_field_role(user)
    start_utc, end_utc = _utc_window_for_mexico_day()
    stmt = select(SalesOrderItemInstance).where(
        SalesOrderItemInstance.is_cancelled == False,  # noqa: E712
        or_(
            (SalesOrderItemInstance.scheduled_inst_mdf >= start_utc)
            & (SalesOrderItemInstance.scheduled_inst_mdf < end_utc),
            (SalesOrderItemInstance.scheduled_inst_stone >= start_utc)
            & (SalesOrderItemInstance.scheduled_inst_stone < end_utc),
        ),
    )
    instances = session.exec(stmt).all()
    supervisor = user.role in {UserRole.MANAGER, UserRole.DIRECTOR}
    out: List[FieldAssignmentRead] = []
    for inst in instances:
        if not supervisor and not _user_leads_today(session, user.id, inst, start_utc, end_utc):
            continue
        out.append(_serialize_instance(session, inst, start_utc, end_utc))
    return FieldMyAssignmentsRead(workday=_today_mexico().isoformat(), assignments=out)


def _decode_b64(data: str) -> bytes:
    raw = data.split(",", 1)[-1] if "," in data else data
    try:
        return base64.b64decode(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Base64 inválido.") from exc


def _upload_b64_image(instance_id: int, data: str, suffix: str) -> str:
    blob = f"field/instance_{instance_id}/{suffix}_{uuid.uuid4().hex}.png"
    url = upload_to_gcs(BytesIO(_decode_b64(data)), blob, content_type="image/png")
    if not url:
        raise HTTPException(status_code=500, detail="No se pudo subir archivo a almacenamiento.")
    return url


def sync_instance(session: Session, user: User, instance_id: int, payload: FieldSyncPayload) -> FieldSyncRead:
    assert_field_role(user)
    inst = session.get(SalesOrderItemInstance, instance_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")
    photo_urls: List[str] = []
    for idx, photo in enumerate(payload.photos):
        if photo.strip():
            photo_urls.append(_upload_b64_image(instance_id, photo, f"photo_{idx}"))
    if photo_urls:
        current = list(inst.evidence_photos_urls or [])
        inst.evidence_photos_urls = current + photo_urls
    signed_at: Optional[datetime] = None
    if payload.signature_base64 and payload.signature_base64.strip():
        _upload_b64_image(instance_id, payload.signature_base64, "signature")
        signed_at = datetime.utcnow()
        inst.signed_received_at = signed_at
    note_parts: List[str] = []
    if payload.notes:
        note_parts.append(payload.notes.strip())
    if payload.incidents:
        note_parts.extend(f"[Incidente] {x}" for x in payload.incidents if x.strip())
    if note_parts:
        prev = (inst.field_work_notes or "").strip()
        merged = "\n".join([p for p in [prev, *note_parts] if p])
        inst.field_work_notes = merged
    if payload.scanned_packages:
        scanned = list(inst.field_scanned_packages or [])
        for code in payload.scanned_packages:
            if code and code not in scanned:
                scanned.append(code)
        inst.field_scanned_packages = scanned
    session.add(inst)
    session.commit()
    session.refresh(inst)
    return FieldSyncRead(
        success=True,
        signed_at=signed_at.isoformat() if signed_at else None,
        photo_urls=photo_urls,
    )


def scan_package(session: Session, user: User, instance_id: int, barcode: str) -> FieldScanPackageRead:
    assert_field_role(user)
    inst = session.get(SalesOrderItemInstance, instance_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")
    code = barcode.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Código de bulto requerido.")
    scanned = list(inst.field_scanned_packages or [])
    if code not in scanned:
        scanned.append(code)
    inst.field_scanned_packages = scanned
    session.add(inst)
    session.commit()
    now = datetime.utcnow()
    return FieldScanPackageRead(success=True, barcode=code, scanned_at=now.isoformat())
