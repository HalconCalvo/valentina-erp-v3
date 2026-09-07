"""Sales domain — business logic (no direct HTTP, queries via repository)."""
from datetime import datetime
from typing import List, Optional, Union

from fastapi import HTTPException
from sqlmodel import Session

from app.models.sales import CustomerPayment, CXCStatus, SalesOrder, SalesOrderStatus
from app.models.users import User
from app.repositories import sales_repository as sales_repo


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
