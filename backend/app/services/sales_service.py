"""Sales domain — business logic (no direct HTTP, queries via repository)."""
from datetime import datetime
from typing import List, Optional, Union

from fastapi import HTTPException
from sqlmodel import Session

from app.models.sales import (
    CustomerPayment,
    CustomerPaymentInstallment,
    CXCStatus,
    PaymentType,
    SalesCommission,
    CommissionType,
    SalesOrder,
    SalesOrderItemInstance,
    SalesOrderStatus,
)
from app.models.treasury import BankTransaction, TransactionType
from app.models.users import User, UserRole
from app.repositories import sales_repository as sales_repo
from app.schemas.sales_schema import (
    ClientPurchaseOrderPayload,
    CustomerPaymentCancel,
    CustomerPaymentUpdate,
    InstallmentCancel,
    InstallmentUpdate,
    PaymentPayload,
)
from app.services.cost_engine import CostEngine


def _normalized_role(user: User) -> str:
    role = user.role
    if role is None:
        return ""
    if hasattr(role, "value"):
        return str(role.value).strip().upper()
    return str(role).strip().upper()


def _is_seller_scoped_role(user: User) -> bool:
    return _normalized_role(user) in ("SALES",)


def _parse_cxc_status(status: Union[str, CXCStatus, None]) -> Optional[CXCStatus]:
    if status is None:
        return None
    if isinstance(status, CXCStatus):
        return status
    try:
        return CXCStatus(str(status).strip().upper())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Estatus CXC inválido: {status}")


def _parse_report_date(value: Optional[str], field: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
        if field == "date_to":
            return parsed.replace(hour=23, minute=59, second=59)
        return parsed
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} inválida (usa YYYY-MM-DD)")


def list_orders(
    session: Session,
    current_user: User,
    status: Optional[SalesOrderStatus] = None,
    client_id: Optional[int] = None,
) -> List[SalesOrder]:
    user_id = current_user.id if _is_seller_scoped_role(current_user) else None
    return sales_repo.get_orders(session, status=status, client_id=client_id, user_id=user_id)


def get_order(session: Session, order_id: int, current_user: User) -> SalesOrder:
    order = sales_repo.get_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if _is_seller_scoped_role(current_user) and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return order


def list_customer_payments(
    session: Session,
    current_user: User,
    status: Union[str, CXCStatus, None] = None,
) -> List[CustomerPayment]:
    parsed = _parse_cxc_status(status) if status is not None else None
    user_id = current_user.id if _is_seller_scoped_role(current_user) else None
    if parsed is not None:
        return sales_repo.get_customer_payments(session, status=parsed, user_id=user_id)
    if _is_seller_scoped_role(current_user):
        return sales_repo.get_customer_payments(session, status=None, user_id=user_id)
    return sales_repo.get_customer_payments(session, status=CXCStatus.PENDING, user_id=None)


def list_pending_cxc(session: Session) -> list:
    rows = sales_repo.get_pending_cxc(session)
    result = []
    for cxc in rows:
        order = sales_repo.get_sales_order_by_id(session, cxc.sales_order_id)
        abonado = sales_repo.sum_active_installments(session, cxc.id)
        result.append({
            "cxc_id": cxc.id,
            "invoice_folio": cxc.invoice_folio,
            "payment_type": cxc.payment_type,
            "monto_factura": cxc.amount,
            "saldo": max(float(cxc.amount or 0.0) - abonado, 0.0),
            "project_name": order.project_name if order else None,
            "sales_order_id": cxc.sales_order_id,
            "client_id": order.client_id if order else None,
        })
    return result


def _cxc_report_estado(cxc: CustomerPayment, abonado: float, saldo: float) -> str:
    if cxc.status == CXCStatus.CANCELLED:
        return "CANCELADA"
    if cxc.status == CXCStatus.PAID or saldo <= 0.01:
        return "PAGADA"
    if abonado > 0:
        return "PARCIAL"
    return "PENDIENTE"


def get_cxc_report(
    session: Session,
    current_user: User,
    estados: List[CXCStatus],
    client_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> list:
    _ = current_user
    df = _parse_report_date(date_from, "date_from")
    dt = _parse_report_date(date_to, "date_to")
    rows = sales_repo.get_cxc_report(session, estados, client_id, df, dt)
    filter_zero_saldo = (
        CXCStatus.PENDING in estados
        and CXCStatus.PAID not in estados
        and CXCStatus.CANCELLED not in estados
    )
    ahora = datetime.utcnow()
    result = []
    for cxc in rows:
        order = sales_repo.get_sales_order_by_id(session, cxc.sales_order_id)
        cli = sales_repo.get_client_by_id(session, order.client_id) if order and order.client_id else None
        abonado = round(sales_repo.sum_active_installments(session, cxc.id), 2)
        monto = round(float(cxc.amount or 0.0), 2)
        saldo = round(monto - abonado, 2)
        if filter_zero_saldo and saldo <= 0.01:
            continue
        antiguedad = (ahora - cxc.invoice_date).days if cxc.invoice_date else None
        result.append({
            "cxc_id": cxc.id,
            "invoice_folio": cxc.invoice_folio,
            "invoice_date": cxc.invoice_date.isoformat() if cxc.invoice_date else None,
            "payment_type": cxc.payment_type,
            "client_id": order.client_id if order else None,
            "client_name": cli.full_name if cli else "—",
            "project_name": order.project_name if order else None,
            "sales_order_id": cxc.sales_order_id,
            "monto": monto,
            "abonado": abonado,
            "saldo": saldo,
            "estado": _cxc_report_estado(cxc, abonado, saldo),
            "antiguedad_dias": antiguedad,
            "payment_date": cxc.payment_date.isoformat() if cxc.payment_date else None,
            "treasury_transaction_id": getattr(cxc, "treasury_transaction_id", None),
        })
    return result


def normalize_commission(rate: float | None) -> float:
    if rate is None:
        return 0.0
    if rate > 1.0:
        return rate / 100.0
    return rate


def _require_order(session: Session, order_id: int) -> SalesOrder:
    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return order


def request_authorization(session: Session, order_id: int) -> SalesOrder:
    order = _require_order(session, order_id)
    if order.status != SalesOrderStatus.DRAFT:
        raise HTTPException(status_code=400, detail="La OV debe estar en DRAFT para solicitar autorización.")
    order.status = SalesOrderStatus.SENT
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def authorize_order(session: Session, order_id: int) -> SalesOrder:
    order = _require_order(session, order_id)
    if order.status != SalesOrderStatus.SENT:
        raise HTTPException(status_code=400, detail="La OV debe estar en SENT para autorizar.")
    order.status = SalesOrderStatus.ACCEPTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def mark_waiting_advance(
    session: Session,
    order_id: int,
    current_user: User,
    payload: ClientPurchaseOrderPayload,
) -> SalesOrder:
    folio = (payload.client_po_folio or "").strip()
    if not folio:
        raise HTTPException(status_code=400, detail="El folio de la OC del cliente es obligatorio.")
    if not payload.client_po_date:
        raise HTTPException(status_code=400, detail="La fecha de la OC del cliente es obligatoria.")

    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="No encontrada")
    if order.status != SalesOrderStatus.ACCEPTED:
        raise HTTPException(status_code=400, detail="La OV debe estar en ACCEPTED.")
    if _is_seller_scoped_role(current_user) and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    analysis = CostEngine.analyze_order_drift(session, order)
    if not analysis["is_safe"]:
        order.status = SalesOrderStatus.CHANGE_REQUESTED
        session.add(order)
        session.commit()
        raise HTTPException(
            status_code=409,
            detail=(
                f"SEMÁFORO ROJO: Inflación del {analysis['variation_percent']}%. "
                f"Supera el {analysis['tolerance_percent']}%. Requiere re-cotizar."
            ),
        )

    order.client_po_folio = folio
    order.client_po_date = payload.client_po_date

    from app.api.v1.endpoints.sales import _create_instances_for_order

    _create_instances_for_order(session, order)
    order.status = SalesOrderStatus.WAITING_ADVANCE
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def cancel_ov(session: Session, order_id: int) -> SalesOrder:
    order = _require_order(session, order_id)
    if order.status != SalesOrderStatus.WAITING_ADVANCE:
        raise HTTPException(
            status_code=400,
            detail="Solo se puede cancelar una OV en espera de anticipo (WAITING_ADVANCE).",
        )
    if sales_repo.get_advance_payment_by_order(session, order.id):
        raise HTTPException(
            status_code=400,
            detail=(
                "Esta OV ya tiene anticipo registrado; no puede cancelarse. "
                "Use Modificar OV para ajustar la cantidad."
            ),
        )
    for item in sales_repo.get_items_by_order(session, order.id):
        for inst in sales_repo.get_active_instances_by_item(session, item.id):
            inst.is_cancelled = True
            session.add(inst)
    order.status = SalesOrderStatus.CANCELLED_OV
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def mark_sold(session: Session, order_id: int, amount: float) -> SalesOrder:
    order = _require_order(session, order_id)
    order.status = SalesOrderStatus.SOLD
    if amount and amount > 0:
        order.advance_invoice_amount = float(amount)
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def _add_cxc_commissions(session: Session, order: SalesOrder, cxc_id: int, cxc_amount: float) -> None:
    tax_rate_obj = sales_repo.get_tax_rate_by_id(session, order.tax_rate_id)
    tax_multiplier = tax_rate_obj.rate if tax_rate_obj else 0.16
    base_before_tax = cxc_amount / (1.0 + tax_multiplier)
    seller_rate = normalize_commission(order.applied_commission_percent or 0.0)
    if order.user_id and seller_rate > 0:
        session.add(SalesCommission(
            customer_payment_id=cxc_id,
            user_id=order.user_id,
            commission_type=CommissionType.SELLER,
            base_amount=base_before_tax,
            rate=seller_rate,
            commission_amount=base_before_tax * seller_rate,
        ))
    for director in sales_repo.get_directors(session):
        dir_rate = normalize_commission(director.global_commission_rate or 0.0)
        if dir_rate > 0:
            session.add(SalesCommission(
                customer_payment_id=cxc_id,
                user_id=director.id,
                commission_type=CommissionType.DIRECTOR_GLOBAL,
                base_amount=base_before_tax,
                rate=dir_rate,
                commission_amount=base_before_tax * dir_rate,
            ))


def confirm_payment(session: Session, order_id: int, cxc_id: int) -> SalesOrder:
    order = _require_order(session, order_id)
    cxc = sales_repo.get_cxc_by_id(session, cxc_id)
    if not cxc:
        raise HTTPException(status_code=404, detail="CxC no encontrada")

    cxc.status = CXCStatus.PAID
    cxc.payment_date = datetime.utcnow()
    order.outstanding_balance -= cxc.amount
    cxc.commission_paid = False
    if order.outstanding_balance <= 0.1:
        order.status = SalesOrderStatus.FINISHED

    _add_cxc_commissions(session, order, cxc_id, float(cxc.amount or 0.0))
    session.add(cxc)
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def request_changes(session: Session, order_id: int) -> SalesOrder:
    order = _require_order(session, order_id)
    order.status = SalesOrderStatus.DRAFT
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def mark_lost(session: Session, order_id: int) -> SalesOrder:
    order = _require_order(session, order_id)
    order.status = SalesOrderStatus.CLIENT_REJECTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def reject_order(session: Session, order_id: int) -> SalesOrder:
    order = _require_order(session, order_id)
    order.status = SalesOrderStatus.REJECTED
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


_INSTALLMENT_ROLES = {UserRole.DIRECTOR, UserRole.MANAGER}
_PAYMENT_EDIT_ROLES = {UserRole.DIRECTOR, UserRole.MANAGER, UserRole.ADMIN}
_PAYMENT_CANCEL_ROLES = {UserRole.DIRECTOR, UserRole.MANAGER}


def _assert_installment_manager(user: User) -> None:
    if user.role not in _INSTALLMENT_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos para gestionar abonos.")


def _recalc_cxc_status(session: Session, cxc: CustomerPayment, order: Optional[SalesOrder]) -> None:
    total = sales_repo.sum_active_installments(session, cxc.id)
    monto = float(cxc.amount or 0.0)
    if total + 0.01 >= monto:
        if cxc.status != CXCStatus.PAID:
            cxc.status = CXCStatus.PAID
            last_dt = sales_repo.get_last_active_installment_date(session, cxc.id)
            cxc.payment_date = last_dt or datetime.utcnow()
    elif cxc.status == CXCStatus.PAID:
        cxc.status = CXCStatus.PENDING
        cxc.payment_date = None
    session.add(cxc)
    if order:
        if float(order.outstanding_balance or 0.0) <= 0.1:
            order.status = SalesOrderStatus.FINISHED
        elif order.status == SalesOrderStatus.FINISHED and float(order.outstanding_balance or 0.0) > 0.1:
            order.status = SalesOrderStatus.SOLD
        session.add(order)


def _unlink_cxc_instances(session: Session, cxc_id: int) -> None:
    for inst in sales_repo.get_instances_by_cxc(session, cxc_id):
        inst.customer_payment_id = None
        session.add(inst)


def _link_cxc_instances(session: Session, cxc_id: int, sales_order_id: int, instance_ids: List[int]) -> None:
    for iid in instance_ids:
        inst_obj = sales_repo.get_instance_for_order(session, iid, sales_order_id)
        if not inst_obj:
            raise HTTPException(status_code=404, detail=f"Instancia {iid} no encontrada en esta orden.")
        if inst_obj.customer_payment_id is not None and inst_obj.customer_payment_id != cxc_id:
            raise HTTPException(status_code=422, detail=f"La instancia {iid} ya está vinculada a otra factura.")
        inst_obj.customer_payment_id = cxc_id
        session.add(inst_obj)


def _adjust_bank_for_installment_diff(
    session: Session, installment: CustomerPaymentInstallment, diff: float
) -> None:
    if not installment.bank_transaction_id or abs(diff) < 0.001:
        return
    bank_tx = sales_repo.get_bank_transaction_by_id(session, installment.bank_transaction_id)
    if not bank_tx or bank_tx.is_cancelled:
        return
    account = sales_repo.get_bank_account_by_id(session, bank_tx.account_id)
    if not account:
        return
    account.current_balance = float(account.current_balance or 0.0) + diff
    bank_tx.amount = float(bank_tx.amount or 0.0) + diff
    session.add(account)
    session.add(bank_tx)


def liberar_comision_anticipo(
    session: Session, order: SalesOrder, payment: CustomerPayment, base_con_iva: float
) -> None:
    _add_cxc_commissions(session, order, payment.id, base_con_iva)


def register_installment(
    session: Session, cxc_id: int, payload: PaymentPayload, current_user: User
) -> dict:
    cxc = sales_repo.get_cxc_by_id(session, cxc_id)
    if not cxc:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")
    if cxc.status == CXCStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="La factura está cancelada.")
    if cxc.status == CXCStatus.PAID:
        raise HTTPException(status_code=409, detail="La factura ya está saldada.")

    monto = float(payload.amount or 0.0)
    if monto <= 0:
        raise HTTPException(status_code=422, detail="El monto del abono debe ser mayor a cero.")

    order = sales_repo.get_sales_order_by_id(session, cxc.sales_order_id)
    abonado_antes = sales_repo.sum_active_installments(session, cxc.id)
    is_advance = bool(payload.is_advance) or cxc.payment_type == PaymentType.ADVANCE
    inst = CustomerPaymentInstallment(
        customer_payment_id=cxc.id,
        amount=monto,
        payment_date=payload.payment_date or datetime.utcnow(),
        reference=payload.reference,
        notes=payload.notes,
        created_by_user_id=current_user.id,
        is_advance=is_advance,
    )
    session.add(inst)

    if payload.account_id:
        account = sales_repo.get_bank_account_by_id(session, payload.account_id)
        if not account:
            raise HTTPException(status_code=404, detail="Cuenta bancaria no encontrada.")
        type_labels = {
            PaymentType.ADVANCE: "Anticipo",
            PaymentType.PROGRESS: "Avance de obra",
            PaymentType.FULL: "Factura 100%",
        }
        tipo = type_labels.get(cxc.payment_type, str(cxc.payment_type))
        proyecto = order.project_name if order else "—"
        folio = cxc.invoice_folio or "S/F"
        bank_tx = BankTransaction(
            account_id=account.id,
            transaction_type=TransactionType.IN,
            amount=monto,
            reference=payload.reference,
            description=f"Abono {tipo} — {proyecto} — Folio {folio}",
            transaction_date=payload.payment_date or datetime.utcnow(),
            related_entity_type="CUSTOMER_PAYMENT",
            related_entity_id=cxc.id,
        )
        session.add(bank_tx)
        session.flush()
        inst.bank_transaction_id = bank_tx.id
        account.current_balance = float(account.current_balance or 0.0) + monto
        session.add(account)
        if cxc.treasury_transaction_id is None:
            session.flush()
            cxc.treasury_transaction_id = bank_tx.id

    if payload.instance_ids:
        for iid in payload.instance_ids:
            inst_obj = sales_repo.get_instance_by_id(session, iid)
            if not inst_obj:
                raise HTTPException(status_code=404, detail=f"Instancia {iid} no encontrada.")
            if inst_obj.customer_payment_id is not None:
                continue
            item_obj = sales_repo.get_item_by_id(session, inst_obj.sales_order_item_id)
            if not item_obj or item_obj.sales_order_id != cxc.sales_order_id:
                raise HTTPException(status_code=422, detail=f"La instancia {iid} no pertenece a esta orden.")
            inst_obj.customer_payment_id = cxc.id
            session.add(inst_obj)

    if order:
        order.outstanding_balance = float(order.outstanding_balance or 0.0) - monto

    abonado_despues = abonado_antes + monto
    factura_saldada = abonado_despues + 0.01 >= float(cxc.amount or 0.0)

    if factura_saldada and cxc.status != CXCStatus.PAID:
        cxc.status = CXCStatus.PAID
        cxc.payment_date = payload.payment_date or datetime.utcnow()
        if cxc.payment_type == PaymentType.ADVANCE and not cxc.commission_paid and order:
            session.flush()
            liberar_comision_anticipo(session, order, cxc, float(cxc.amount or 0.0))
            cxc.commission_paid = True
            if order.status == SalesOrderStatus.WAITING_ADVANCE:
                order.status = SalesOrderStatus.SOLD
        session.add(cxc)

    if order:
        if order.outstanding_balance <= 0.1:
            order.status = SalesOrderStatus.FINISHED
        session.add(order)

    session.commit()
    session.refresh(cxc)
    return {
        "message": "Abono registrado.",
        "cxc_id": cxc.id,
        "abonado_total": abonado_despues,
        "factura_amount": cxc.amount,
        "factura_status": cxc.status,
        "saldada": factura_saldada,
    }


def update_installment(
    session: Session, installment_id: int, data: InstallmentUpdate, current_user: User
) -> dict:
    _assert_installment_manager(current_user)
    row = sales_repo.get_installment_by_id(session, installment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Abono no encontrado.")
    if row.is_cancelled:
        raise HTTPException(status_code=409, detail="El abono está cancelado.")
    cxc = sales_repo.get_cxc_by_id(session, row.customer_payment_id)
    if not cxc or cxc.status == CXCStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="La factura está cancelada.")
    order = sales_repo.get_sales_order_by_id(session, cxc.sales_order_id)
    updates = data.model_dump(exclude_unset=True)
    instance_ids = updates.pop("instance_ids", None)
    old_amount = float(row.amount or 0.0)
    if "amount" in updates:
        new_amount = float(updates["amount"] or 0.0)
        if new_amount <= 0:
            raise HTTPException(status_code=422, detail="El monto debe ser mayor a cero.")
        diff = new_amount - old_amount
        if abs(diff) >= 0.001 and order:
            order.outstanding_balance = float(order.outstanding_balance or 0.0) - diff
            session.add(order)
            _adjust_bank_for_installment_diff(session, row, diff)
    for field, value in updates.items():
        setattr(row, field, value)
    session.add(row)
    if instance_ids is not None:
        _unlink_cxc_instances(session, cxc.id)
        if instance_ids:
            _link_cxc_instances(session, cxc.id, cxc.sales_order_id, instance_ids)
    _recalc_cxc_status(session, cxc, order)
    session.commit()
    session.refresh(row)
    return {"message": "Abono actualizado.", "installment_id": row.id}


def cancel_installment(
    session: Session, installment_id: int, data: InstallmentCancel, current_user: User
) -> dict:
    _assert_installment_manager(current_user)
    reason = (data.cancel_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="El motivo de cancelación es obligatorio.")
    row = sales_repo.get_installment_by_id(session, installment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Abono no encontrado.")
    if row.is_cancelled:
        raise HTTPException(status_code=409, detail="El abono ya está cancelado.")
    cxc = sales_repo.get_cxc_by_id(session, row.customer_payment_id)
    if not cxc:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")
    order = sales_repo.get_sales_order_by_id(session, cxc.sales_order_id)
    amount = float(row.amount or 0.0)
    row.is_cancelled = True
    row.cancel_reason = reason
    row.cancelled_at = datetime.utcnow()
    session.add(row)
    if order:
        order.outstanding_balance = float(order.outstanding_balance or 0.0) + amount
        session.add(order)
    if row.bank_transaction_id:
        bank_tx = sales_repo.get_bank_transaction_by_id(session, row.bank_transaction_id)
        if bank_tx and not bank_tx.is_cancelled:
            account = sales_repo.get_bank_account_by_id(session, bank_tx.account_id)
            if account:
                account.current_balance = float(account.current_balance or 0.0) - amount
                session.add(account)
            bank_tx.is_cancelled = True
            bank_tx.cancel_reason = reason
            bank_tx.cancelled_at = datetime.utcnow()
            session.add(bank_tx)
    _unlink_cxc_instances(session, cxc.id)
    _recalc_cxc_status(session, cxc, order)
    session.commit()
    return {"message": "Abono cancelado.", "installment_id": row.id}


def emit_advance_invoice(
    session: Session, order_id: int, payload: PaymentPayload, current_user: User
) -> dict:
    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada.")
    monto = float(payload.amount or 0.0)
    if monto <= 0:
        raise HTTPException(status_code=422, detail="El monto de la factura de anticipo debe ser mayor a cero.")
    if not payload.invoice_folio:
        raise HTTPException(status_code=422, detail="El folio de la factura de anticipo es obligatorio.")
    new_cxc = CustomerPayment(
        sales_order_id=order.id,
        payment_type=PaymentType.ADVANCE,
        invoice_folio=payload.invoice_folio,
        amount=monto,
        status=CXCStatus.PENDING,
        created_by_user_id=current_user.id,
        invoice_date=payload.invoice_date or datetime.utcnow(),
    )
    session.add(new_cxc)
    session.commit()
    session.refresh(new_cxc)
    return {
        "message": "Factura de anticipo emitida.",
        "cxc_id": new_cxc.id,
        "payment_type": new_cxc.payment_type,
        "invoice_folio": new_cxc.invoice_folio,
        "amount": new_cxc.amount,
        "status": new_cxc.status,
    }


def emit_full_invoice(
    session: Session, order_id: int, payload: PaymentPayload, current_user: User
) -> dict:
    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada.")
    existing = sales_repo.get_full_invoice_by_order(session, order_id)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Ya existe una factura al 100% para esta OV (folio: {existing.invoice_folio}).",
        )
    monto = float(payload.amount or 0.0)
    if monto <= 0:
        raise HTTPException(status_code=422, detail="El monto de la factura debe ser mayor a cero.")
    if not payload.invoice_folio:
        raise HTTPException(status_code=422, detail="El folio de la factura es obligatorio.")
    new_cxc = CustomerPayment(
        sales_order_id=order.id,
        payment_type=PaymentType.FULL,
        invoice_folio=payload.invoice_folio,
        amount=monto,
        status=CXCStatus.PENDING,
        created_by_user_id=current_user.id,
        invoice_date=payload.invoice_date or datetime.utcnow(),
    )
    session.add(new_cxc)
    if order.status == SalesOrderStatus.WAITING_ADVANCE:
        order.status = SalesOrderStatus.SOLD
        session.add(order)
    session.commit()
    session.refresh(new_cxc)
    return {
        "message": "Factura al 100% emitida.",
        "cxc_id": new_cxc.id,
        "payment_type": new_cxc.payment_type,
        "invoice_folio": new_cxc.invoice_folio,
        "amount": new_cxc.amount,
        "status": new_cxc.status,
    }


def update_customer_payment(
    session: Session,
    order_id: int,
    payment_id: int,
    data: CustomerPaymentUpdate,
    current_user: User,
) -> CustomerPayment:
    if current_user.role not in _PAYMENT_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos para editar facturas de cliente.")
    payment = sales_repo.get_payment_by_id(session, payment_id)
    if not payment or payment.sales_order_id != order_id:
        raise HTTPException(status_code=404, detail="Factura no encontrada en esta orden.")
    updates = data.model_dump(exclude_unset=True)
    if payment.treasury_transaction_id is not None:
        forbidden = set(updates.keys()) - {"notes"}
        if forbidden:
            raise HTTPException(
                status_code=422,
                detail="This invoice has a registered payment. Only notes can be edited.",
            )
        if "notes" in updates:
            payment.notes = updates["notes"]
    else:
        instance_ids = updates.pop("instance_ids", None)
        for field, value in updates.items():
            setattr(payment, field, value)
        if instance_ids is not None:
            for inst in sales_repo.get_instances_by_cxc(session, payment_id):
                inst.customer_payment_id = None
                session.add(inst)
            for iid in instance_ids:
                inst = sales_repo.get_instance_for_order(session, iid, order_id)
                if not inst:
                    raise HTTPException(
                        status_code=422,
                        detail="Instance not found or does not belong to this order.",
                    )
                inst.customer_payment_id = payment_id
                session.add(inst)
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def cancel_customer_payment(
    session: Session,
    order_id: int,
    payment_id: int,
    data: CustomerPaymentCancel,
    current_user: User,
) -> CustomerPayment:
    if current_user.role not in _PAYMENT_CANCEL_ROLES:
        raise HTTPException(status_code=403, detail="Sin permisos para cancelar facturas de cliente.")
    payment = sales_repo.get_payment_by_id(session, payment_id)
    if not payment or payment.sales_order_id != order_id:
        raise HTTPException(status_code=404, detail="Factura no encontrada en esta orden.")
    if payment.status != CXCStatus.PENDING:
        raise HTTPException(status_code=422, detail="Only pending invoices can be cancelled.")
    if payment.treasury_transaction_id is not None:
        raise HTTPException(
            status_code=422,
            detail="This invoice has a registered payment. Reverse the bank transaction first.",
        )
    payment.status = CXCStatus.CANCELLED
    payment.notes = (payment.notes or "") + f" | CANCELLED: {data.cancel_reason}"
    for inst in sales_repo.get_instances_by_cxc(session, payment_id):
        inst.customer_payment_id = None
        session.add(inst)
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment
