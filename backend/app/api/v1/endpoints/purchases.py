from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, text, Field, SQLModel
from typing import List, Optional
from datetime import datetime, timedelta, date
from sqlalchemy import func, or_
from types import SimpleNamespace

from app.models.inventory import PurchaseRequisition, PurchaseOrder, PurchaseOrderItem
from app.models.material import Material
from app.models.foundations import Provider, GlobalConfig
from app.models.finance import PurchaseInvoice
from app.models.users import UserRole
from app.core.deps import get_session, CurrentUser
from app.services.purchase_manager import PurchaseManager
from app.services import purchase_service
from app.services.pdf_generator import PDFGenerator
from app.services.email_service import send_purchase_order_email
from app.services.inventory_manager import registrar_movimiento_inventario
from app.schemas.inventory_schema import (
    PurchaseOrderUpdate,
    PurchaseOrderItemUpdate,
    PurchaseOrderItemCancel,
    ManualOrderItemCreate,
    ManualOrderCreate,
    RequisitionCreate,
    POCreateFromPlanning,
)
from app.schemas.finance_schema import PurchaseInvoiceUpdate, OperationalExpenseUpdate, OperationalExpenseCancel
from app.schemas.treasury_schema import OperationalExpenseCreate

router = APIRouter()

@router.post("/requisitions/", response_model=PurchaseRequisition, status_code=status.HTTP_201_CREATED)
def create_requisition(*, db: Session = Depends(get_session), req_in: RequisitionCreate):
    return purchase_service.create_requisition(db, req_in)

@router.get("/requisitions/", response_model=List[dict])
def read_requisitions(db: Session = Depends(get_session), skip: int = 0, limit: int = 100):
    return purchase_service.list_requisitions(db, skip=skip, limit=limit)

@router.put("/requisitions/{req_id}/cancel")
def cancel_requisition(
    *, db: Session = Depends(get_session), req_id: int, current_user: CurrentUser
):
    return purchase_service.cancel_requisition(db, req_id, current_user)


@router.delete("/requisitions/{req_id}")
def delete_purchase_requisition(
    *, db: Session = Depends(get_session), req_id: int, current_user: CurrentUser
):
    return purchase_service.delete_requisition(db, req_id, current_user)


@router.patch("/requisitions/{req_id}")
def update_requisition(
    *,
    db: Session = Depends(get_session),
    req_id: int,
    data: dict = Body(...),
    current_user: CurrentUser,
):
    return purchase_service.update_requisition(db, req_id, data, current_user)


@router.put("/requisitions/{req_id}/transfer")
def transfer_critical_requisition(
    *, db: Session = Depends(get_session), req_id: int, current_user: CurrentUser
):
    return purchase_service.transfer_requisition(db, req_id, current_user)


@router.put("/requisitions/{req_id}/status")
def update_requisition_status(
    *, db: Session = Depends(get_session), req_id: int, status: str, current_user: CurrentUser
):
    return purchase_service.update_requisition_status(db, req_id, status, current_user)


@router.put("/requisitions/{req_id}/assign")
def assign_requisition_provider(
    *,
    db: Session = Depends(get_session),
    req_id: int,
    provider_id: int = Body(...),
    expected_unit_cost: float = Body(...),
    current_user: CurrentUser,
):
    return purchase_service.assign_requisition_provider(
        db, req_id, provider_id, expected_unit_cost, current_user
    )

@router.get("/orders/", response_model=List[dict])
def read_purchase_orders(
    *,
    db: Session = Depends(get_session),
    status: str | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    skip: int = 0,
    limit: int = 200,
):
    return purchase_service.list_purchase_orders(
        db, status=status, search=search, date_from=date_from,
        date_to=date_to, skip=skip, limit=limit,
    )

@router.get("/orders/{po_id}/check-invoice-folio")
def check_invoice_folio(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    folio: str,
    current_user: CurrentUser,
):
    return purchase_service.check_invoice_folio(db, po_id, folio)

@router.post("/orders/bulk-emit")
def emit_bulk_purchase_order(*, db: Session = Depends(get_session), data: POCreateFromPlanning, current_user: CurrentUser):
    if not data.provider_id: raise HTTPException(status_code=400)
    if not data.items or len(data.items) == 0:
        raise HTTPException(status_code=400, detail="No se puede crear una orden de compra sin partidas.")
    timestamp = datetime.now().strftime('%y%m%d%H%M')
    new_folio = f"OC-{timestamp}"
    po = PurchaseOrder(
        provider_id=data.provider_id,
        folio=new_folio,
        status="DRAFT",
        total_estimated_amount=0.0,
        is_advance=False,
        created_by_user_id=current_user.id,
        overhead_category=data.overhead_category
    )
    db.add(po)
    db.flush() 

    total_amount = 0.0
    for item in data.items:
        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            material_id=item.get("material_id"),
            custom_description=item.get("name"),
            quantity_ordered=item.get("qty"),
            expected_unit_cost=item.get("expected_cost"),
            requisition_id=item.get("requisition_id") 
        )
        db.add(po_item)
        total_amount += (float(item.get("qty")) * float(item.get("expected_cost")))

        req_id = item.get("requisition_id")
        if req_id:
            requisition = db.get(PurchaseRequisition, req_id)
            if requisition:
                requisition.status = "PROCESADA"
                db.add(requisition)

    po.total_estimated_amount = total_amount
    db.commit()
    return {"status": "success", "po_id": po.id, "folio": new_folio}

@router.put("/orders/{po_id}/authorize")
def authorize_purchase_order(
    *, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser
):
    return purchase_service.authorize_po(db, po_id, current_user)


@router.put("/orders/{po_id}/revoke")
def revoke_purchase_order(
    *, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser
):
    return purchase_service.revoke_po(db, po_id, current_user)


@router.post("/orders/{po_id}/reject")
def reject_purchase_order(
    *, db: Session = Depends(get_session), po_id: int, action: str, current_user: CurrentUser
):
    return purchase_service.reject_po(db, po_id, action, current_user)


@router.delete("/orders/{po_id}/items/{item_id}")
def remove_item_from_purchase_order(
    *, db: Session = Depends(get_session), po_id: int, item_id: int, current_user: CurrentUser
):
    return purchase_service.remove_po_item(db, po_id, item_id, current_user)


@router.put("/orders/{po_id}/dispatch")
def dispatch_purchase_order(
    *, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser
):
    return purchase_service.dispatch_po(db, po_id, current_user)


@router.put("/orders/{po_id}/cancel")
def cancel_dispatched_order(
    *, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser
):
    return purchase_service.cancel_dispatched_po(db, po_id, current_user)

@router.put("/orders/{po_id}/receive")
def receive_purchase_order(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    current_user: CurrentUser,
    data: dict = Body(...),
):
    return purchase_service.receive_purchase_order(db, po_id, data, current_user)

@router.put("/orders/{po_id}/items/{item_id}/no-more")
def mark_item_no_more(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    item_id: int,
    current_user: CurrentUser,
    data: dict = Body(...),
):
    return purchase_service.mark_item_no_more(db, po_id, item_id, data, current_user)


@router.put("/orders/{po_id}/declare-satisfied")
def declare_order_satisfied(
    *, db: Session = Depends(get_session), po_id: int, current_user: CurrentUser
):
    return purchase_service.declare_po_satisfied(db, po_id, current_user)


@router.put("/orders/{po_id}/report-discrepancy")
def report_cost_discrepancy(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    data: dict = Body(...),
    current_user: CurrentUser,
):
    return purchase_service.report_cost_discrepancy(db, po_id, data, current_user)

@router.get("/planning/consolidated", response_model=List[dict])
def get_purchase_planning(db: Session = Depends(get_session)):
    return purchase_service.get_purchase_planning(db)


@router.get("/notifications/pending-tasks")
def get_admin_pending_tasks(db: Session = Depends(get_session)):
    return purchase_service.get_pending_tasks(db)

@router.get("/orders/{po_id}/pdf")
def download_purchase_order_pdf(po_id: int, db: Session = Depends(get_session)):
    return purchase_service.generate_po_pdf(db, po_id)

@router.post("/orders/manual")
def create_manual_order(
    *,
    order_in: ManualOrderCreate,
    db: Session = Depends(get_session),
    current_user: CurrentUser
):
    if not order_in.items or len(order_in.items) == 0:
        raise HTTPException(status_code=400, detail="No se puede crear una orden de compra sin partidas.")

    provider = db.exec(select(Provider).where(Provider.business_name.ilike(order_in.provider_name))).first()
    if not provider:
        provider = Provider(business_name=order_in.provider_name, credit_days=0, is_active=True)
        db.add(provider)
        db.commit()
        db.refresh(provider)

    timestamp = datetime.now().strftime("%y%m%d%H%M%S")
    subtotal = sum(item.qty * item.expected_cost for item in order_in.items)

    try:
        new_order = PurchaseOrder(
            provider_id=provider.id,
            folio=f"OC-M{timestamp}",
            status="DRAFT",
            total_estimated_amount=subtotal,
            created_by_user_id=current_user.id,
            is_advance=False,
            overhead_category=order_in.overhead_category
        )
        db.add(new_order)
        db.flush()

        for item_in in order_in.items:
            material = None
            # Búsqueda robusta: por SKU con TRIM (ignora espacios), case-insensitive
            if item_in.sku:
                sku_limpio = item_in.sku.strip()
                material = db.exec(
                    select(Material).where(func.trim(Material.sku).ilike(sku_limpio))
                ).first()
            # Respaldo: por nombre con TRIM
            if not material and item_in.name:
                name_limpio = item_in.name.strip()
                material = db.exec(
                    select(Material).where(func.trim(Material.name).ilike(name_limpio))
                ).first()
            # Si no existe, NO crear material a medias: rechazar con mensaje claro
            if not material:
                raise HTTPException(
                    status_code=400,
                    detail=f"El material '{item_in.sku or item_in.name}' no existe en el catálogo. Debe darse de alta antes de crear la orden."
                )

            po_item = PurchaseOrderItem(
                purchase_order_id=new_order.id,
                material_id=material.id,
                custom_description=item_in.name,
                quantity_ordered=item_in.qty,
                expected_unit_cost=item_in.expected_cost
            )
            db.add(po_item)

        db.commit()
    except Exception:
        db.rollback()
        raise

    return {"message": "Orden manual creada con éxito", "order_id": new_order.id}

@router.post("/orders/{po_id}/request-advance")
def request_order_advance(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    current_user: CurrentUser,
    data: dict = Body(...),
):
    return purchase_service.request_advance(db, po_id, data, current_user)


# ─────────────────────────────────────────────────────────────────────────────
# GASTOS OPERATIVOS (overhead directo a CxP sin OC)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/operational-expenses")
def create_operational_expense(
    *,
    db: Session = Depends(get_session),
    data: OperationalExpenseCreate,
    current_user: CurrentUser,
):
    return purchase_service.create_operational_expense(db, data, current_user)


@router.get("/operational-expenses")
def get_operational_expenses(
    *,
    db: Session = Depends(get_session),
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
):
    return purchase_service.get_operational_expenses(db, current_user, skip=skip, limit=limit)


@router.patch("/operational-expenses/{expense_id}")
def update_operational_expense(
    *,
    db: Session = Depends(get_session),
    expense_id: int,
    data: OperationalExpenseUpdate,
    current_user: CurrentUser,
):
    return purchase_service.update_operational_expense(db, expense_id, data, current_user)


@router.patch("/operational-expenses/{expense_id}/cancel")
def cancel_operational_expense(
    *,
    db: Session = Depends(get_session),
    expense_id: int,
    data: OperationalExpenseCancel,
    current_user: CurrentUser,
):
    return purchase_service.cancel_operational_expense(db, expense_id, data, current_user)


@router.post("/orders/{po_id}/send-email")
def send_purchase_order_by_email(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    data: dict = Body(...),
    current_user: CurrentUser
):
    from app.models.users import User
    from types import SimpleNamespace

    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if po.status != "AUTORIZADA":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden enviar órdenes Autorizadas"
        )

    to_email = data.get("to_email", "").strip()
    if not to_email or "@" not in to_email:
        raise HTTPException(status_code=400, detail="Correo del proveedor inválido")

    config = db.exec(select(GlobalConfig)).first()
    if not config or not config.smtp_email or not config.smtp_password:
        raise HTTPException(
            status_code=400,
            detail="Configura el correo de envío en Ajustes antes de usar esta función (smtp_email y smtp_password en GlobalConfig)."
        )

    # Generar PDF
    items = db.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
    ).all()

    creator = None
    if getattr(po, "created_by_user_id", None):
        creator = db.get(User, po.created_by_user_id)
    elaborado_por = "Sistema"
    if creator:
        elaborado_por = getattr(
            creator, "full_name",
            getattr(creator, "username", getattr(creator, "email", "Sistema"))
        )

    mock_items = []
    for it in items:
        mat = db.get(Material, it.material_id) if it.material_id else None
        mock_items.append(SimpleNamespace(
            material=mat,
            custom_description=it.custom_description,
            quantity_ordered=it.quantity_ordered,
            expected_unit_cost=it.expected_unit_cost,
            sku=getattr(it, "sku", None)
        ))

    mock_po = SimpleNamespace(
        folio=po.folio,
        created_at=po.created_at,
        authorized_by=getattr(po, "authorized_by", None),
        created_by=elaborado_por,
        items=mock_items
    )

    provider = db.get(Provider, po.provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    company_name = getattr(config, "company_name", "Valentina") or "Valentina"
    smtp_host = getattr(config, "smtp_host", None) or "smtp.gmail.com"

    pdf_gen = PDFGenerator()
    pdf_buffer = pdf_gen.generate_po_pdf(
        order=mock_po, provider=provider, config=config
    )

    try:
        send_purchase_order_email(
            smtp_host=smtp_host,
            smtp_email=config.smtp_email,
            smtp_password=config.smtp_password,
            to_email=to_email,
            provider_name=provider.business_name,
            folio=po.folio,
            pdf_buffer=pdf_buffer,
            company_name=company_name
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al enviar el correo: {str(e)}"
        )

    # Marcar como ENVIADA automáticamente
    po.status = "ENVIADA"
    db.add(po)
    db.commit()

    return {
        "status": "success",
        "message": f"OC {po.folio} enviada por correo a {to_email}"
    }


@router.put("/orders/{po_id}/items/{item_id}/correct-reception")
def correct_reception_item(*, db: Session = Depends(get_session), po_id: int, item_id: int, current_user: CurrentUser, data: dict = Body(...)):
    """
    5e — Corrige una recepción mal capturada, por renglón.
    Revierte inventario (kárdex + stock), ajusta la CxP y reabre el saldo de la OC.
    Roles: sin pagos aplicados -> ADMIN/ADMINISTRACION/ADMINISTRADOR/GERENCIA/DIRECTOR.
           con pagos aplicados -> SOLO GERENCIA.
    """
    from app.models.finance import PurchaseInvoice, SupplierPayment, PurchaseInvoiceItem
    try:
        po = db.get(PurchaseOrder, po_id)
        if not po:
            raise HTTPException(status_code=404, detail="Orden no encontrada")
        item = db.get(PurchaseOrderItem, item_id)
        if not item or item.purchase_order_id != po_id:
            raise HTTPException(status_code=404, detail="Renglón no encontrado en esta orden")

        reason = (data.get("reason") or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Debe indicar un motivo de la corrección")
        if data.get("real_qty") is None:
            raise HTTPException(status_code=400, detail="Debe indicar la cantidad realmente recibida")
        real_qty = float(data.get("real_qty"))
        actual = float(item.quantity_received or 0)
        if real_qty < 0:
            raise HTTPException(status_code=400, detail="La cantidad real no puede ser negativa")
        if real_qty >= actual:
            raise HTTPException(status_code=400, detail=f"La cantidad real ({real_qty}) debe ser menor a la registrada ({actual}). Para recibir más, usa la recepción normal.")
        delta = actual - real_qty  # cantidad a revertir

        # --- Ubicar las líneas de factura de este renglón (de la más reciente hacia atrás) ---
        pii_rows = db.exec(
            select(PurchaseInvoiceItem)
            .where(PurchaseInvoiceItem.purchase_order_item_id == item_id)
            .order_by(PurchaseInvoiceItem.id.desc())
        ).all()

        # --- Validar pagos aplicados sobre las facturas involucradas ---
        ap_ids = list({r.accounts_payable_id for r in pii_rows if r.accounts_payable_id})
        hay_pagos = False
        for _ap_id in ap_ids:
            _inv = db.exec(select(PurchaseInvoice).where(PurchaseInvoice.accounts_payable_id == _ap_id)).first()
            if _inv:
                _pay = db.exec(select(SupplierPayment).where(SupplierPayment.purchase_invoice_id == _inv.id)).first()
                if _pay:
                    hay_pagos = True
                    break

        role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()
        if hay_pagos:
            if role != "MANAGER":
                raise HTTPException(status_code=403, detail="Esta factura ya tiene pagos aplicados. Solo Gerencia puede corregirla.")
        else:
            if role not in ["ADMIN", "MANAGER", "DIRECTOR"]:
                raise HTTPException(status_code=403, detail="No tienes permiso para corregir recepciones.")

        # --- 1) Revertir inventario (kárdex + stock) ---
        mat = db.get(Material, item.material_id) if item.material_id else None
        costo = float(getattr(item, "expected_unit_cost", 0.0) or 0.0)
        if pii_rows:
            costo = float(pii_rows[0].unit_cost or costo)
        if mat and (getattr(mat, 'production_route', 'MATERIAL') or 'MATERIAL').upper() == 'MATERIAL':
            factor = float(getattr(mat, 'conversion_factor', 1) or 1)
            qty_units = delta * factor
            from app.services import inventory_service

            inventory_service.register_movement(
                db,
                mat.id,
                "ADJUSTMENT_OUT",
                abs(qty_units),
                unit_cost=costo,
                reason="CORRECCION_RECEPCION",
                commit=False,
            )

        # --- 2) Ajustar la CxP (y su gemela) por el monto revertido ---
        monto_revertido = delta * costo
        restante = delta
        for r in pii_rows:
            if restante <= 0:
                break
            quitar = min(float(r.quantity_received or 0), restante)
            if quitar <= 0:
                continue
            r.quantity_received = float(r.quantity_received or 0) - quitar
            restante -= quitar
            if r.quantity_received <= 0:
                db.delete(r)
            else:
                db.add(r)
        for _ap_id in ap_ids:
            _row = db.exec(text("SELECT subtotal, tax_rate, total_amount FROM accounts_payable WHERE id = :i").bindparams(i=_ap_id)).first()
            if not _row:
                continue
            _sub_actual = float(_row[0] or 0)
            _rate = float(_row[1] or 0.16)
            _nuevo_sub = max(_sub_actual - monto_revertido, 0.0)
            _nuevo_tax = round(_nuevo_sub * _rate, 2)
            _nuevo_total = round(_nuevo_sub + _nuevo_tax, 2)
            if _nuevo_total <= 0.01:
                # Total llegó a cero — eliminar el registro para liberar el folio
                db.exec(text("""
                    DELETE FROM purchase_invoices
                    WHERE accounts_payable_id = :ap_id
                """).bindparams(ap_id=_ap_id))
                db.exec(text("""
                    DELETE FROM accounts_payable
                    WHERE id = :i
                """).bindparams(i=_ap_id))
            else:
                db.exec(text("""
                    UPDATE accounts_payable
                    SET subtotal = :s, tax_amount = :t, total_amount = :tot, status = 'PENDIENTE'
                    WHERE id = :i
                """).bindparams(s=round(_nuevo_sub, 2), t=_nuevo_tax, tot=_nuevo_total, i=_ap_id))
                db.exec(text("""
                    UPDATE purchase_invoices
                    SET subtotal = :s, tax_amount = :t, total_amount = :tot
                    WHERE accounts_payable_id = :ap_id
                """).bindparams(s=round(_nuevo_sub, 2), t=_nuevo_tax, tot=_nuevo_total, ap_id=_ap_id))
            break  # solo la factura más reciente involucrada

        # --- 3) Reabrir el renglón en la OC ---
        item.quantity_received = real_qty
        item.is_cancelled = False
        item.is_fulfilled = False
        item.cancel_reason = f"Corrección de recepción: {reason}"
        db.add(item)
        db.flush()

        # --- 4) Recalcular estado de la OC (mismo criterio que /no-more) ---
        all_items = db.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)).all()
        hay_pendiente = False
        hay_recibido = False
        for it in all_items:
            rec = float(it.quantity_received or 0)
            if it.is_cancelled or it.is_fulfilled:
                if rec > 0:
                    hay_recibido = True
                continue
            ordn = float(it.quantity_ordered or 0)
            if rec > 0:
                hay_recibido = True
            if ordn > 0 and rec < ordn:
                hay_pendiente = True
        if not hay_pendiente:
            po.status = "RECIBIDA_TOTAL" if hay_recibido else "CANCELADA"
        else:
            po.status = "RECIBIDA_PARCIAL"
        db.add(po)
        db.commit()
        return {
            "status": "success",
            "revertido": delta,
            "nueva_cantidad": real_qty,
            "monto_revertido": round(monto_revertido, 2),
            "po_status": po.status,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al corregir recepción: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# EDICIÓN Y CANCELACIÓN DE PARTIDAS (post-creación, pre-recepción)
# ─────────────────────────────────────────────────────────────────────────────

@router.patch("/orders/{po_id}")
def update_purchase_order(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    data: PurchaseOrderUpdate,
    current_user: CurrentUser,
):
    return purchase_service.update_purchase_order(db, po_id, data, current_user)


@router.patch("/orders/{po_id}/items/{item_id}")
def update_purchase_order_item(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    item_id: int,
    data: PurchaseOrderItemUpdate,
    current_user: CurrentUser,
):
    return purchase_service.update_po_item(db, po_id, item_id, data, current_user)


@router.patch("/orders/{po_id}/items/{item_id}/cancel")
def cancel_purchase_order_item(
    *,
    db: Session = Depends(get_session),
    po_id: int,
    item_id: int,
    data: PurchaseOrderItemCancel,
    current_user: CurrentUser,
):
    return purchase_service.cancel_po_item(db, po_id, item_id, data, current_user)


@router.patch("/invoices/{invoice_id}")
def update_purchase_invoice(
    *,
    db: Session = Depends(get_session),
    invoice_id: int,
    data: PurchaseInvoiceUpdate,
    current_user: CurrentUser,
):
    return purchase_service.update_purchase_invoice(db, invoice_id, data, current_user)