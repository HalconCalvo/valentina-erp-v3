from datetime import date
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel, select

from app.core.deps import CurrentUser, SessionDep
from app.models.finance import InvoiceStatus, PurchaseInvoice
from app.models.users import UserRole
from app.schemas.analytics_schema import (
    CashFlowProjection,
    CxcAgingStats,
    OrderProfitabilityItem,
    TopClientItem,
)
from app.services import analytics_service


class AccountsPayableStats(SQLModel):
    total_payable: float
    overdue_amount: float
    upcoming_amount: float
    breakdown_by_age: Dict[str, float]


router = APIRouter()


def _require_director(current_user: CurrentUser) -> None:
    role = (
        current_user.role.value
        if hasattr(current_user.role, "value")
        else str(current_user.role)
    ).upper()
    if role != UserRole.DIRECTOR.value:
        raise HTTPException(status_code=403, detail="Acceso restringido al Director.")


@router.get("/accounts-payable-summary", response_model=AccountsPayableStats)
def get_accounts_payable_summary(session: SessionDep) -> Any:
    statement = select(PurchaseInvoice).where(
        PurchaseInvoice.status != InvoiceStatus.PAID,
        PurchaseInvoice.status != InvoiceStatus.CANCELLED,
    )
    invoices = session.exec(statement).all()
    total_payable = 0.0
    overdue_amount = 0.0
    upcoming_amount = 0.0
    breakdown = {"current": 0.0, "1-30": 0.0, "31-60": 0.0, "61-90": 0.0, "+90": 0.0}
    today = date.today()
    for inv in invoices:
        balance = inv.outstanding_balance
        if balance <= 0:
            continue
        total_payable += balance
        if inv.due_date:
            days_overdue = (today - inv.due_date).days
        else:
            days_overdue = 0
        if days_overdue <= 0:
            upcoming_amount += balance
            breakdown["current"] += balance
        else:
            overdue_amount += balance
            if days_overdue <= 30:
                breakdown["1-30"] += balance
            elif days_overdue <= 60:
                breakdown["31-60"] += balance
            elif days_overdue <= 90:
                breakdown["61-90"] += balance
            else:
                breakdown["+90"] += balance
    return AccountsPayableStats(
        total_payable=total_payable,
        overdue_amount=overdue_amount,
        upcoming_amount=upcoming_amount,
        breakdown_by_age=breakdown,
    )


@router.get("/cxc-aging", response_model=CxcAgingStats)
def get_cxc_aging(session: SessionDep, current_user: CurrentUser) -> Any:
    _require_director(current_user)
    return analytics_service.get_cxc_aging(session)


@router.get("/order-profitability", response_model=list[OrderProfitabilityItem])
def get_order_profitability(session: SessionDep, current_user: CurrentUser) -> Any:
    _require_director(current_user)
    return analytics_service.get_order_profitability(session)


@router.get("/cash-flow-projection", response_model=CashFlowProjection)
def get_cash_flow_projection(session: SessionDep, current_user: CurrentUser) -> Any:
    _require_director(current_user)
    return analytics_service.get_cash_flow_projection(session)


@router.get("/top-clients", response_model=list[TopClientItem])
def get_top_clients(session: SessionDep, current_user: CurrentUser) -> Any:
    _require_director(current_user)
    return analytics_service.get_top_clients(session)
