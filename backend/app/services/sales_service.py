"""Sales domain — business logic (no direct HTTP, queries via repository)."""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.sales import (
    CustomerPayment,
    CustomerPaymentInstallment,
    CXCStatus,
    PaymentType,
    SalesCommission,
    CommissionType,
    SalesOrder,
    SalesOrderItem,
    SalesOrderItemInstance,
    SalesOrderStatus,
)
from app.models.treasury import BankTransaction, TransactionType
from app.models.users import User, UserRole
from app.repositories import sales_repository as sales_repo
from app.schemas.sales_schema import (
    AddItemsPayload,
    ClientPurchaseOrderPayload,
    CommissionPaidUpdate,
    CommissionPayrollUpdate,
    CommissionsPayrollOverview,
    CustomerPaymentCancel,
    CustomerPaymentUpdate,
    InstallmentCancel,
    InstallmentUpdate,
    PaymentPayload,
    RegisterProgressPayload,
    PayrollCommissionRow,
    SalesCommissionRead,
    SalesOrderCreate,
    SalesOrderItemCreate,
    SalesOrderUpdate,
    RetentionUpdate,
    RetentionDefaultsUpdate,
    RetentionAlertRead,
)
from app.services.cost_engine import CostEngine
from app.services import audit_service


def _normalized_role(user: User) -> str:
    role = user.role
    if role is None:
        return ""
    if hasattr(role, "value"):
        return str(role.value).strip().upper()
    return str(role).strip().upper()


def _is_seller_scoped_role(user: User) -> bool:
    return _normalized_role(user) in ("SALES",)


_COMMISSION_RELEASE_ROLES = {UserRole.DIRECTOR, UserRole.MANAGER}
_RETENTION_LOCKED = frozenset({"INVOICED", "COLLECTED", "WAIVED"})


def _require_manager_or_director(user: User) -> None:
    role = _normalized_role(user)
    if role not in {UserRole.DIRECTOR.value, UserRole.MANAGER.value}:
        raise HTTPException(status_code=403, detail="Acceso restringido a Dirección o Gerencia.")


def _order_reference(order_id: int) -> str:
    return f"OV-{str(order_id).zfill(4)}"


def _get_payment_or_404(session: Session, payment_id: int) -> CustomerPayment:
    payment = sales_repo.get_cxc_by_id(session, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Cobro no encontrado.")
    return payment


def _assert_retention_editable(payment: CustomerPayment) -> None:
    status = (payment.retention_status or "").upper()
    if status in _RETENTION_LOCKED:
        raise HTTPException(
            status_code=400,
            detail="La retención ya fue facturada, cobrada o liberada; no se puede modificar.",
        )


def _calc_retention_due(invoice_date: Optional[datetime], days: int) -> datetime:
    base = invoice_date or datetime.utcnow()
    return base + timedelta(days=int(days))


def update_retention(
    session: Session, payment_id: int, data: RetentionUpdate, current_user: User
) -> CustomerPayment:
    _require_manager_or_director(current_user)
    payment = _get_payment_or_404(session, payment_id)
    _assert_retention_editable(payment)
    payload = data.model_dump(exclude_unset=True)
    if "retention_percent" in payload and payload["retention_percent"] is not None:
        payment.retention_percent = float(payload["retention_percent"])
        payment.retention_amount = round(
            float(payment.amount or 0.0) * payment.retention_percent / 100.0, 2
        )
    if "retention_amount" in payload and payload["retention_amount"] is not None:
        payment.retention_amount = float(payload["retention_amount"])
    if "retention_days" in payload and payload["retention_days"] is not None:
        payment.retention_days = int(payload["retention_days"])
    if "retention_notes" in payload:
        payment.retention_notes = payload["retention_notes"]
    if "retention_due_date" in payload:
        payment.retention_due_date = payload["retention_due_date"]
    elif "retention_days" in payload and payment.invoice_date:
        payment.retention_due_date = _calc_retention_due(
            payment.invoice_date, payment.retention_days
        )
    if float(payment.retention_amount or 0.0) > 0 and not payment.retention_status:
        payment.retention_status = "PENDING"
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def invoice_retention(
    session: Session, payment_id: int, folio: str, current_user: User
) -> CustomerPayment:
    _require_manager_or_director(current_user)
    payment = _get_payment_or_404(session, payment_id)
    if (payment.retention_status or "").upper() != "PENDING":
        raise HTTPException(status_code=400, detail="Solo se puede facturar retención en estatus PENDING.")
    clean_folio = (folio or "").strip()
    if not clean_folio:
        raise HTTPException(status_code=422, detail="El folio de la factura de retención es obligatorio.")
    payment.retention_invoice_folio = clean_folio
    payment.retention_status = "INVOICED"
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def collect_retention(session: Session, payment_id: int, current_user: User) -> CustomerPayment:
    _require_manager_or_director(current_user)
    payment = _get_payment_or_404(session, payment_id)
    if (payment.retention_status or "").upper() != "INVOICED":
        raise HTTPException(status_code=400, detail="Solo se puede cobrar retención en estatus INVOICED.")
    payment.retention_status = "COLLECTED"
    session.add(payment)

    order = sales_repo.get_sales_order_by_id(session, payment.sales_order_id)
    retention_amt = float(payment.retention_amount or 0.0)
    if order and retention_amt > 0:
        tax_rate_obj = sales_repo.get_tax_rate_by_id(session, order.tax_rate_id)
        tax_multiplier = tax_rate_obj.rate if tax_rate_obj else 0.16
        base_before_tax = retention_amt / (1.0 + tax_multiplier)
        now = datetime.utcnow()
        ref = f"Fondo de Garantía — {payment.invoice_folio or payment.id}"
        seller_rate = normalize_commission(order.applied_commission_percent or 0.0)
        if order.user_id and seller_rate > 0:
            session.add(SalesCommission(
                customer_payment_id=payment.id,
                user_id=order.user_id,
                commission_type=CommissionType.SELLER,
                base_amount=base_before_tax,
                rate=seller_rate,
                commission_amount=base_before_tax * seller_rate,
                is_advance=False,
                is_released=True,
                released_at=now,
                admin_notes=ref,
            ))
        for director in sales_repo.get_directors(session):
            dir_rate = normalize_commission(director.global_commission_rate or 0.0)
            if dir_rate > 0:
                session.add(SalesCommission(
                    customer_payment_id=payment.id,
                    user_id=director.id,
                    commission_type=CommissionType.DIRECTOR_GLOBAL,
                    base_amount=base_before_tax,
                    rate=dir_rate,
                    commission_amount=base_before_tax * dir_rate,
                    is_advance=False,
                    is_released=True,
                    released_at=now,
                    admin_notes=ref,
                ))

    order_ref = _order_reference(payment.sales_order_id)
    audit_service.log_action(
        session,
        current_user,
        audit_service.COLLECT,
        audit_service.RETENTION,
        payment.id,
        order_ref,
        f"Cobró Fondo de Garantía ${retention_amt:,.2f} en {order_ref}",
        old_values={"retention_status": "INVOICED", "retention_amount": retention_amt},
        new_values={"retention_status": "COLLECTED", "retention_amount": retention_amt},
    )
    session.commit()
    session.refresh(payment)
    return payment


def waive_retention(
    session: Session, payment_id: int, reason: str, current_user: User
) -> CustomerPayment:
    _require_manager_or_director(current_user)
    payment = _get_payment_or_404(session, payment_id)
    clean_reason = (reason or "").strip()
    if not clean_reason:
        raise HTTPException(status_code=422, detail="El motivo de liberación es obligatorio.")
    status = (payment.retention_status or "").upper()
    if status in {"COLLECTED", "WAIVED"}:
        raise HTTPException(status_code=400, detail="La retención ya fue cobrada o liberada.")
    old_notes = payment.retention_notes
    payment.retention_status = "WAIVED"
    payment.retention_notes = clean_reason
    session.add(payment)
    order_ref = _order_reference(payment.sales_order_id)
    audit_service.log_action(
        session,
        current_user,
        audit_service.CANCEL,
        audit_service.RETENTION,
        payment.id,
        order_ref,
        f"Liberó Fondo de Garantía en {order_ref}",
        old_values={"retention_status": status, "retention_notes": old_notes},
        new_values={"retention_status": "WAIVED", "retention_notes": clean_reason},
    )
    session.commit()
    session.refresh(payment)
    return payment


def get_retention_alerts(session: Session, current_user: User) -> List[RetentionAlertRead]:
    _require_manager_or_director(current_user)
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    horizon = today + timedelta(days=7)
    rows = sales_repo.get_retention_alert_payments(session, horizon)
    alerts: List[RetentionAlertRead] = []
    for payment in rows:
        order = sales_repo.get_sales_order_by_id(session, payment.sales_order_id)
        client = sales_repo.get_client_by_id(session, order.client_id) if order else None
        due = payment.retention_due_date
        days_until = (due.date() - today.date()).days if due else 0
        alerts.append(
            RetentionAlertRead(
                payment_id=int(payment.id),
                sales_order_id=int(payment.sales_order_id),
                order_folio=f"OV-{str(payment.sales_order_id).zfill(4)}",
                project_name=order.project_name if order else "—",
                client_name=client.full_name if client else "—",
                invoice_folio=payment.invoice_folio,
                retention_amount=float(payment.retention_amount or 0.0),
                retention_due_date=due,
                retention_status=payment.retention_status,
                days_until_due=days_until,
                is_overdue=days_until < 0,
            )
        )
    return alerts


def update_retention_defaults(
    session: Session, order_id: int, data: RetentionDefaultsUpdate, current_user: User
) -> SalesOrder:
    _require_manager_or_director(current_user)
    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    order.default_retention_percent = float(data.default_retention_percent)
    order.default_retention_days = int(data.default_retention_days)
    session.add(order)
    session.commit()
    session.refresh(order)
    return order


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
            "nc_advance_folio": cxc.nc_advance_folio,
            "nc_advance_amount": round(float(cxc.nc_advance_amount or 0.0), 2),
            "nc_retention_folio": cxc.nc_retention_folio,
            "nc_retention_amount": round(float(cxc.nc_retention_amount or 0.0), 2),
            "retention_status": cxc.retention_status,
            "retention_due_date": cxc.retention_due_date.isoformat() if cxc.retention_due_date else None,
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


def _instance_meets_release_conditions(inst: SalesOrderItemInstance) -> bool:
    if inst.is_cancelled:
        return True
    folio = (inst.administration_invoice_folio or "").strip()
    return inst.signed_received_at is not None and bool(folio)


def _cxc_all_instances_ready(session: Session, cxc_id: int) -> bool:
    instances = sales_repo.get_instances_by_cxc(session, cxc_id)
    active = [i for i in instances if not i.is_cancelled]
    if not active:
        return False
    return all(_instance_meets_release_conditions(i) for i in active)


def _resolve_commission_release(
    session: Session, cxc_id: int, *, is_advance: bool
) -> tuple[bool, Optional[datetime]]:
    if is_advance:
        return False, None
    if _cxc_all_instances_ready(session, cxc_id):
        return True, datetime.utcnow()
    return False, None


def _add_cxc_commissions(
    session: Session,
    order: SalesOrder,
    cxc_id: int,
    cxc_amount: float,
    *,
    is_advance: bool = False,
) -> None:
    tax_rate_obj = sales_repo.get_tax_rate_by_id(session, order.tax_rate_id)
    tax_multiplier = tax_rate_obj.rate if tax_rate_obj else 0.16
    base_before_tax = cxc_amount / (1.0 + tax_multiplier)
    is_released, released_at = _resolve_commission_release(session, cxc_id, is_advance=is_advance)
    seller_rate = normalize_commission(order.applied_commission_percent or 0.0)
    if order.user_id and seller_rate > 0:
        session.add(SalesCommission(
            customer_payment_id=cxc_id,
            user_id=order.user_id,
            commission_type=CommissionType.SELLER,
            base_amount=base_before_tax,
            rate=seller_rate,
            commission_amount=base_before_tax * seller_rate,
            is_advance=is_advance,
            is_released=is_released,
            released_at=released_at,
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
                is_advance=is_advance,
                is_released=is_released,
                released_at=released_at,
            ))


def check_and_release_commissions(session: Session, instance_id: int) -> None:
    inst = sales_repo.get_instance_by_id(session, instance_id)
    if not inst or inst.is_cancelled or not inst.customer_payment_id:
        return
    cxc_id = inst.customer_payment_id
    if not _cxc_all_instances_ready(session, cxc_id):
        return
    now = datetime.utcnow()
    for commission in sales_repo.get_commissions_by_cxc(session, cxc_id):
        if commission.is_advance or commission.is_released or commission.is_paid:
            continue
        commission.is_released = True
        commission.released_at = now
        session.add(commission)


def release_commission(session: Session, commission_id: int, current_user: User) -> dict:
    if _normalized_role(current_user) not in {r.value for r in _COMMISSION_RELEASE_ROLES}:
        raise HTTPException(status_code=403, detail="Sin permisos para liberar comisiones.")
    commission = sales_repo.get_commission_by_id(session, commission_id)
    if not commission:
        raise HTTPException(status_code=404, detail="Comisión no encontrada.")
    if commission.is_paid:
        raise HTTPException(status_code=400, detail="La comisión ya está pagada.")
    if not commission.is_advance:
        raise HTTPException(
            status_code=400,
            detail="Solo las comisiones de anticipo requieren liberación manual.",
        )
    if commission.is_released:
        return {"ok": True, "commission_id": commission_id, "is_released": True}
    commission.is_released = True
    commission.released_at = datetime.utcnow()
    session.add(commission)
    amount = float(commission.commission_amount or 0.0)
    audit_service.log_action(
        session,
        current_user,
        audit_service.RELEASE,
        audit_service.COMMISSION,
        commission.id,
        None,
        f"Liberó comisión de anticipo ${amount:,.2f}",
        old_values={"is_released": False},
        new_values={"is_released": True, "commission_amount": amount},
    )
    session.commit()
    session.refresh(commission)
    return {"ok": True, "commission_id": commission_id, "is_released": commission.is_released}


def confirm_payment(
    session: Session, order_id: int, cxc_id: int, current_user: Optional[User] = None
) -> SalesOrder:
    order = _require_order(session, order_id)
    cxc = sales_repo.get_cxc_by_id(session, cxc_id)
    if not cxc:
        raise HTTPException(status_code=404, detail="CxC no encontrada")

    cxc_amount = float(cxc.amount or 0.0)
    order_ref = _order_reference(order_id)
    cxc.status = CXCStatus.PAID
    cxc.payment_date = datetime.utcnow()
    order.outstanding_balance -= cxc.amount
    cxc.commission_paid = False
    if order.outstanding_balance <= 0.1:
        order.status = SalesOrderStatus.FINISHED

    is_advance = cxc.payment_type == PaymentType.ADVANCE
    if not cxc.commission_paid:
        _add_cxc_commissions(
            session, order, cxc_id, float(cxc.amount or 0.0), is_advance=is_advance
        )
        cxc.commission_paid = True
    session.add(cxc)
    session.add(order)
    audit_service.log_action(
        session,
        current_user,
        audit_service.COLLECT,
        audit_service.CUSTOMER_PAYMENT,
        cxc.id,
        order_ref,
        f"Registró cobro de CxC ${cxc_amount:,.2f} en {order_ref}",
        old_values={"status": "PENDING", "amount": cxc_amount},
        new_values={"status": "PAID", "amount": cxc_amount},
    )
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
    _add_cxc_commissions(session, order, payment.id, base_con_iva, is_advance=True)


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
    saldo_factura = float(cxc.amount or 0.0) - abonado_antes
    if monto > saldo_factura + 0.01:
        raise HTTPException(status_code=400, detail="El abono supera el saldo pendiente de la factura.")
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
        if not cxc.commission_paid and order:
            session.flush()
            is_advance = cxc.payment_type == PaymentType.ADVANCE
            _add_cxc_commissions(
                session, order, cxc.id, float(cxc.amount or 0.0), is_advance=is_advance
            )
            cxc.commission_paid = True
            if is_advance and order.status == SalesOrderStatus.WAITING_ADVANCE:
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
    order_ref = _order_reference(order.id) if order else None
    audit_service.log_action(
        session,
        current_user,
        audit_service.CANCEL,
        audit_service.INSTALLMENT,
        row.id,
        order_ref,
        f"Canceló abono de ${amount:,.2f} en {order_ref}" if order_ref else f"Canceló abono de ${amount:,.2f}",
        old_values={"amount": amount, "is_cancelled": False},
        new_values={"amount": amount, "is_cancelled": True, "cancel_reason": reason},
    )
    session.commit()
    return {"message": "Abono cancelado.", "installment_id": row.id}


def emit_advance_invoice(
    session: Session, order_id: int, payload: PaymentPayload, current_user: User
) -> dict:
    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada.")
    if sales_repo.get_advance_payment_by_order(session, order_id):
        raise HTTPException(
            status_code=400,
            detail="Ya existe una factura de anticipo para esta OV.",
        )
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


def register_progress_invoice(
    session: Session,
    order_id: int,
    payload: RegisterProgressPayload,
    current_user: User,
) -> dict:
    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada.")

    all_instances: List[SalesOrderItemInstance] = []
    for item in order.items or []:
        all_instances.extend(item.instances or [])

    if payload.instance_ids:
        candidates = [
            inst for inst in all_instances
            if inst.id in payload.instance_ids
            and inst.customer_payment_id is None
            and inst.administration_invoice_folio is None
        ]
    else:
        candidates = [
            inst for inst in all_instances
            if inst.customer_payment_id is None
            and inst.administration_invoice_folio is None
        ]

    if not candidates:
        raise HTTPException(
            status_code=422,
            detail="No hay instancias pendientes de facturación para esta orden.",
        )

    invoice_dt = payload.invoice_date or datetime.utcnow()
    nc_advance_folio = (payload.nc_advance_folio or "").strip() or None
    nc_retention_folio = (payload.nc_retention_folio or "").strip() or None
    invoice_folio = (payload.invoice_folio or "").strip() or None

    new_cxc = CustomerPayment(
        sales_order_id=order.id,
        payment_type=PaymentType.PROGRESS,
        invoice_folio=invoice_folio,
        amount=float(payload.amount or 0.0),
        amortized_advance=float(payload.amortized_advance or 0.0),
        status=CXCStatus.PENDING,
        created_by_user_id=current_user.id,
        invoice_date=invoice_dt,
        nc_advance_folio=nc_advance_folio,
        nc_advance_amount=float(payload.nc_advance_amount or 0.0),
        nc_retention_folio=nc_retention_folio,
        nc_retention_amount=float(payload.nc_retention_amount or 0.0),
    )

    if nc_retention_folio and float(payload.nc_retention_amount or 0.0) > 0:
        retention_days = int(getattr(order, "default_retention_days", None) or 90)
        new_cxc.retention_amount = float(payload.nc_retention_amount)
        new_cxc.retention_status = "PENDING"
        new_cxc.retention_percent = float(getattr(order, "default_retention_percent", None) or 0.0)
        new_cxc.retention_days = retention_days
        new_cxc.retention_due_date = _calc_retention_due(invoice_dt, retention_days)

    session.add(new_cxc)
    session.flush()

    from app.models.production import PayrollPayment, PayrollStatus, InstallationAssignment

    linked = []
    for inst in candidates:
        inst.customer_payment_id = new_cxc.id
        if invoice_folio:
            inst.administration_invoice_folio = invoice_folio
        session.add(inst)
        payroll_stmt = (
            select(PayrollPayment)
            .join(
                InstallationAssignment,
                PayrollPayment.installation_assignment_id == InstallationAssignment.id,
            )
            .where(InstallationAssignment.instance_id == inst.id)
            .where(PayrollPayment.status == PayrollStatus.PENDING_SIGNATURE)
        )
        payroll_rows = session.exec(payroll_stmt).all()
        for pp in payroll_rows:
            pp.status = PayrollStatus.READY_TO_PAY
            session.add(pp)
        linked.append({
            "instance_id": inst.id,
            "custom_name": inst.custom_name,
            "production_status": inst.production_status,
        })

    session.commit()
    session.refresh(new_cxc)

    return {
        "message": f"Factura de avance registrada. {len(linked)} instancia(s) vinculada(s).",
        "cxc_id": new_cxc.id,
        "payment_type": new_cxc.payment_type,
        "invoice_folio": new_cxc.invoice_folio,
        "amount": new_cxc.amount,
        "status": new_cxc.status,
        "instances_linked": linked,
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


_ORDER_EDIT_ROLES = {UserRole.DIRECTOR, UserRole.MANAGER, UserRole.SALES}
_AMPLIABLE_STATUSES = {
    SalesOrderStatus.ACCEPTED,
    SalesOrderStatus.WAITING_ADVANCE,
    SalesOrderStatus.SOLD,
    SalesOrderStatus.IN_PRODUCTION,
}


def _can_edit_client_po_meta(user: User) -> bool:
    return _normalized_role(user) in ("ADMIN", "MANAGER", "DIRECTOR", "SALES", "DESIGN")


def _assert_order_editor(user: User) -> None:
    if user.role not in _ORDER_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="No tienes permisos para editar órdenes de venta.")


def _days_waiting(reference: Optional[datetime]) -> int:
    if not reference:
        return 0
    now = datetime.utcnow()
    ref = reference.replace(tzinfo=None) if getattr(reference, "tzinfo", None) else reference
    return max(0, (now - ref).days)


def _build_item_snapshot(session: Session, item_in: SalesOrderItemCreate) -> tuple[dict, float]:
    snapshot_data: dict = {}
    calculated_frozen_cost = 0.0
    if item_in.origin_version_id:
        version = sales_repo.get_product_version_with_components(session, item_in.origin_version_id)
        if version:
            snapshot_data = {
                "source_version": version.version_name,
                "captured_at": datetime.now().isoformat(),
                "ingredients": [],
            }
            for component in version.components:
                mat = sales_repo.get_material_by_id(session, component.material_id)
                if mat:
                    factor = float(mat.conversion_factor) if mat.conversion_factor and mat.conversion_factor > 0 else 1.0
                    current_cost = mat.current_cost / factor
                    line_cost = component.quantity * current_cost
                    calculated_frozen_cost += line_cost
                    snapshot_data["ingredients"].append({
                        "material_id": mat.id,
                        "sku": mat.sku,
                        "name": mat.name,
                        "qty_recipe": component.quantity,
                        "frozen_unit_cost": current_cost,
                        "line_total": line_cost,
                    })
    else:
        snapshot_data = item_in.cost_snapshot or {"type": "MANUAL_ENTRY"}
        calculated_frozen_cost = float(item_in.frozen_unit_cost or 0.0)
    return snapshot_data, calculated_frozen_cost


def _persist_order_item(
    session: Session,
    order_id: int,
    item_in: SalesOrderItemCreate,
    snapshot_data: dict,
    calculated_frozen_cost: float,
    line_amount: float,
) -> SalesOrderItem:
    db_item = SalesOrderItem(
        sales_order_id=order_id,
        product_name=item_in.product_name,
        origin_version_id=item_in.origin_version_id,
        quantity=item_in.quantity,
        unit_price=item_in.unit_price,
        subtotal_price=line_amount,
        cost_snapshot=snapshot_data,
        frozen_unit_cost=calculated_frozen_cost,
        is_resale=getattr(item_in, "is_resale", False),
        resale_sku=getattr(item_in, "resale_sku", None),
        commercial_description=getattr(item_in, "commercial_description", None),
    )
    session.add(db_item)
    return db_item


def create_order(session: Session, order_in: SalesOrderCreate, current_user: User) -> SalesOrder:
    try:
        if not order_in.items:
            raise HTTPException(status_code=422, detail="La OV debe incluir al menos una partida.")
        tax_rate = sales_repo.get_tax_rate_by_id(session, order_in.tax_rate_id)
        if not tax_rate:
            raise HTTPException(status_code=400, detail="Tasa de impuestos inválida")

        raw_commission = current_user.commission_rate if current_user.commission_rate is not None else 0.0
        applied_commission = normalize_commission(raw_commission)

        db_order = SalesOrder(
            project_name=order_in.project_name,
            client_id=order_in.client_id,
            tax_rate_id=order_in.tax_rate_id,
            user_id=current_user.id,
            applied_commission_percent=applied_commission,
            valid_until=order_in.valid_until,
            delivery_date=order_in.delivery_date,
            applied_margin_percent=order_in.applied_margin_percent,
            applied_tolerance_percent=order_in.applied_tolerance_percent,
            advance_percent=order_in.advance_percent,
            has_advance_invoice=order_in.has_advance_invoice,
            currency=order_in.currency,
            notes=order_in.notes,
            conditions=order_in.conditions,
            external_invoice_ref=order_in.external_invoice_ref,
            is_warranty=order_in.is_warranty,
            status=SalesOrderStatus.DRAFT,
            created_at=datetime.utcnow(),
        )
        session.add(db_order)
        session.commit()
        session.refresh(db_order)

        items_sum = 0.0
        for item_in in order_in.items:
            snapshot_data, calculated_frozen_cost = _build_item_snapshot(session, item_in)
            line_amount = item_in.quantity * item_in.unit_price
            items_sum += line_amount
            _persist_order_item(session, db_order.id, item_in, snapshot_data, calculated_frozen_cost, line_amount)
            session.flush()

        commission_amount = items_sum - (items_sum / (1 + applied_commission)) if applied_commission > 0 else 0.0
        tax_amount = items_sum * tax_rate.rate
        total_price = items_sum + tax_amount

        db_order.commission_amount = commission_amount
        db_order.subtotal = items_sum
        db_order.tax_amount = tax_amount
        db_order.total_price = total_price
        db_order.outstanding_balance = total_price

        session.add(db_order)
        session.commit()
        session.refresh(db_order)
        return db_order
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e


def update_order(
    session: Session, order_id: int, order_update: SalesOrderUpdate, current_user: User
) -> SalesOrder:
    _assert_order_editor(current_user)
    db_order = sales_repo.get_sales_order_by_id(session, order_id)
    if not db_order:
        raise HTTPException(status_code=404, detail="No encontrada")
    if _is_seller_scoped_role(current_user) and db_order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    update_data = order_update.model_dump(exclude_unset=True)
    items_data = update_data.pop("items", None)

    if not _can_edit_client_po_meta(current_user):
        update_data.pop("client_po_folio", None)
        update_data.pop("client_po_date", None)

    for key, value in update_data.items():
        setattr(db_order, key, value)
    if "applied_commission_percent" in update_data:
        db_order.applied_commission_percent = normalize_commission(update_data["applied_commission_percent"])

    if items_data is not None:
        sales_repo.clear_order_items_and_instances(session, order_id)
        items_sum = 0.0
        for item_in in order_update.items:
            snapshot_data, calculated_frozen_cost = _build_item_snapshot(session, item_in)
            qty = item_in.quantity or 0
            price = item_in.unit_price or 0
            line_amount = qty * price
            items_sum += line_amount
            _persist_order_item(session, db_order.id, item_in, snapshot_data, calculated_frozen_cost, line_amount)
            session.flush()

        comm_percent = db_order.applied_commission_percent or 0.0
        commission_amount = items_sum - (items_sum / (1 + comm_percent)) if comm_percent > 0 else 0.0
        tax_rate_obj = sales_repo.get_tax_rate_by_id(session, db_order.tax_rate_id)
        tax_multiplier = tax_rate_obj.rate if tax_rate_obj else 0.16
        tax_total = items_sum * tax_multiplier

        db_order.subtotal = items_sum
        db_order.commission_amount = commission_amount
        db_order.tax_amount = tax_total
        db_order.total_price = items_sum + tax_total
        db_order.outstanding_balance = db_order.total_price

    session.add(db_order)
    session.commit()
    session.refresh(db_order)
    return db_order


def add_items_to_order(
    session: Session, order_id: int, payload: AddItemsPayload, current_user: User
) -> SalesOrder:
    _assert_order_editor(current_user)
    order = sales_repo.get_sales_order_by_id(session, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    if _is_seller_scoped_role(current_user) and order.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    if order.status not in _AMPLIABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=(
                f"No se puede ampliar una orden en estado {order.status}. "
                "Solo órdenes en curso (ACEPTADA, ESPERANDO ANTICIPO, VENDIDA, EN PRODUCCIÓN)."
            ),
        )
    if not payload.items:
        raise HTTPException(status_code=422, detail="Debes enviar al menos una partida nueva.")

    added_sum = 0.0
    for item_in in payload.items:
        snapshot_data, calculated_frozen_cost = _build_item_snapshot(session, item_in)
        qty = item_in.quantity or 0
        price = item_in.unit_price or 0
        line_amount = qty * price
        added_sum += line_amount
        _persist_order_item(session, order.id, item_in, snapshot_data, calculated_frozen_cost, line_amount)

    session.flush()
    order = sales_repo.get_order_by_id(session, order_id)
    from app.api.v1.endpoints.sales import _create_instances_for_order

    _create_instances_for_order(session, order)

    tax_rate_obj = sales_repo.get_tax_rate_by_id(session, order.tax_rate_id)
    tax_multiplier = tax_rate_obj.rate if tax_rate_obj else 0.16
    nuevo_subtotal = (order.subtotal or 0.0) + added_sum
    comm_percent = order.applied_commission_percent or 0.0
    nueva_comision = (
        nuevo_subtotal - (nuevo_subtotal / (1 + comm_percent)) if comm_percent > 0 else 0.0
    )
    nuevo_tax = nuevo_subtotal * tax_multiplier
    nuevo_total = nuevo_subtotal + nuevo_tax
    incremento_total = nuevo_total - (order.total_price or 0.0)

    order.subtotal = nuevo_subtotal
    order.commission_amount = nueva_comision
    order.tax_amount = nuevo_tax
    order.total_price = nuevo_total
    order.outstanding_balance = (order.outstanding_balance or 0.0) + incremento_total

    session.add(order)
    session.commit()
    session.refresh(order)
    return order


def get_commissions_overview(session: Session) -> CommissionsPayrollOverview:
    raw = sales_repo.get_commissions_payroll_overview_data(session)
    retained: List[PayrollCommissionRow] = []
    payable: List[PayrollCommissionRow] = []
    paid: List[PayrollCommissionRow] = []

    for o in raw["waiting_orders"]:
        seller = sales_repo.get_user_by_id(session, o.user_id) if o.user_id else None
        est = float(o.commission_amount or 0.0)
        if est <= 0 and o.applied_commission_percent and o.total_price:
            est = float(o.total_price) * float(o.applied_commission_percent)
        retained.append(PayrollCommissionRow(
            kind="PROVISIONAL",
            id=None,
            sales_order_id=o.id,
            project_name=o.project_name,
            seller_name=seller.full_name if seller else None,
            amount=est,
            days_waiting=_days_waiting(o.created_at),
            reference_label="Anticipo pendiente (OV)",
            customer_payment_id=None,
            cxc_status="WAITING_ADVANCE",
            admin_notes=None,
            payroll_deferred=False,
        ))

    for c, cx in raw["retained"]:
        user = sales_repo.get_user_by_id(session, c.user_id)
        order = sales_repo.get_sales_order_by_id(session, cx.sales_order_id)
        label = (
            f"Anticipo retenido — Cobro #{cx.id}"
            if c.is_advance
            else f"Progreso retenido — Cobro #{cx.id}"
        )
        retained.append(PayrollCommissionRow(
            kind="ACCRUED",
            id=c.id,
            sales_order_id=order.id if order else cx.sales_order_id,
            project_name=order.project_name if order else None,
            seller_name=user.full_name if user else None,
            amount=float(c.commission_amount),
            days_waiting=_days_waiting(c.created_at),
            reference_label=label,
            customer_payment_id=cx.id,
            cxc_status=cx.status.value if hasattr(cx.status, "value") else str(cx.status),
            admin_notes=c.admin_notes,
            payroll_deferred=bool(c.payroll_deferred),
        ))

    for c, cx in raw["ready"]:
        user = sales_repo.get_user_by_id(session, c.user_id)
        order = sales_repo.get_sales_order_by_id(session, cx.sales_order_id)
        payable.append(PayrollCommissionRow(
            kind="ACCRUED",
            id=c.id,
            sales_order_id=order.id if order else cx.sales_order_id,
            project_name=order.project_name if order else None,
            seller_name=user.full_name if user else None,
            amount=float(c.commission_amount),
            days_waiting=_days_waiting(c.created_at),
            reference_label=f"Cobro #{cx.id} liquidado",
            customer_payment_id=cx.id,
            cxc_status=cx.status.value if hasattr(cx.status, "value") else str(cx.status),
            admin_notes=c.admin_notes,
            payroll_deferred=bool(c.payroll_deferred),
        ))

    for c in raw["paid"]:
        cx = sales_repo.get_cxc_by_id(session, c.customer_payment_id)
        user = sales_repo.get_user_by_id(session, c.user_id)
        order = sales_repo.get_sales_order_by_id(session, cx.sales_order_id) if cx else None
        paid.append(PayrollCommissionRow(
            kind="ACCRUED",
            id=c.id,
            sales_order_id=order.id if order else (cx.sales_order_id if cx else 0),
            project_name=order.project_name if order else None,
            seller_name=user.full_name if user else None,
            amount=float(c.commission_amount),
            days_waiting=0,
            reference_label="Comisión pagada",
            customer_payment_id=c.customer_payment_id,
            cxc_status=(cx.status.value if cx and hasattr(cx.status, "value") else (str(cx.status) if cx else None)),
            admin_notes=c.admin_notes,
            payroll_deferred=False,
        ))

    return CommissionsPayrollOverview(
        retained_total=sum(r.amount for r in retained),
        payable_total=sum(r.amount for r in payable),
        paid_total=sum(r.amount for r in paid),
        retained=retained,
        payable=payable,
        paid=paid,
    )


def update_commission_payroll(
    session: Session, commission_id: int, data: CommissionPayrollUpdate, current_user: User
) -> dict:
    _ = current_user
    commission = sales_repo.get_commission_by_id(session, commission_id)
    if not commission:
        raise HTTPException(status_code=404, detail="Comisión no encontrada.")
    if data.admin_notes is not None:
        commission.admin_notes = data.admin_notes
    if data.payroll_deferred is not None:
        if data.payroll_deferred and not (data.admin_notes or commission.admin_notes):
            raise HTTPException(
                status_code=422,
                detail="Debes documentar el motivo en observaciones antes de aplazar u omitir el pago.",
            )
        commission.payroll_deferred = data.payroll_deferred
    session.add(commission)
    session.commit()
    session.refresh(commission)
    return {"ok": True, "commission_id": commission_id}


def get_commissions_report(
    session: Session,
    current_user: User,
    user_id: Optional[int] = None,
    commission_type: Optional[str] = None,
    is_paid: Optional[bool] = None,
) -> List[SalesCommissionRead]:
    _ = current_user
    commissions = sales_repo.get_commissions_by_filters(
        session, user_id=user_id, commission_type=commission_type, is_paid=is_paid
    )
    results: List[SalesCommissionRead] = []
    for c in commissions:
        user = sales_repo.get_user_by_id(session, c.user_id)
        cxc = sales_repo.get_cxc_by_id(session, c.customer_payment_id)
        order = sales_repo.get_sales_order_by_id(session, cxc.sales_order_id) if cxc else None
        results.append(SalesCommissionRead(
            id=c.id,
            customer_payment_id=c.customer_payment_id,
            user_id=c.user_id,
            user_name=user.full_name if user else None,
            user_role=user.role if user else None,
            commission_type=c.commission_type,
            base_amount=c.base_amount,
            rate=c.rate,
            commission_amount=c.commission_amount,
            is_paid=c.is_paid,
            created_at=c.created_at,
            is_advance=bool(getattr(c, "is_advance", False)),
            is_released=bool(getattr(c, "is_released", False)),
            released_at=getattr(c, "released_at", None),
            sales_order_id=order.id if order else None,
            project_name=order.project_name if order else None,
            payment_amount=cxc.amount if cxc else None,
            admin_notes=getattr(c, "admin_notes", None),
            payroll_deferred=bool(getattr(c, "payroll_deferred", False)),
        ))
    return results


def mark_commission_paid(
    session: Session, commission_id: int, data: CommissionPaidUpdate, current_user: User
) -> dict:
    _ = current_user
    commission = sales_repo.get_commission_by_id(session, commission_id)
    if not commission:
        raise HTTPException(status_code=404, detail="Comisión no encontrada.")
    if data.is_paid and not commission.is_released:
        raise HTTPException(status_code=400, detail="Comisión no liberada aún")
    commission.is_paid = data.is_paid
    session.add(commission)
    if data.is_paid:
        seller = sales_repo.get_user_by_id(session, commission.user_id)
        seller_name = seller.full_name if seller else "—"
        amount = float(commission.commission_amount or 0.0)
        audit_service.log_action(
            session,
            current_user,
            audit_service.PAY,
            audit_service.COMMISSION,
            commission.id,
            None,
            f"Pagó comisión ${amount:,.2f} a {seller_name}",
            old_values={"is_paid": False},
            new_values={"is_paid": True, "commission_amount": amount},
        )
    session.commit()
    return {"ok": True, "commission_id": commission_id, "is_paid": commission.is_paid}
