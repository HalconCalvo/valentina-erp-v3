"""Sanitation tools (docs/SANEAMIENTO.md §6): preview first, then apply with a reason (DIRECTOR or MANAGER)."""
from fastapi import APIRouter

from app.core.deps import SessionDep
from app.core.permissions import BALANCE_FIX_ROLES, allow
from app.schemas.balance_recalc_schema import BalanceRecalcApply, BalanceRecalcPreviewRead, BalanceRecalcResultRead
from app.services import balance_recalc_service

router = APIRouter()


@router.get("/balances", response_model=BalanceRecalcPreviewRead, dependencies=[allow(BALANCE_FIX_ROLES)])
def preview_balances(session: SessionDep):
    return balance_recalc_service.preview(session)


@router.post("/balances/apply", response_model=BalanceRecalcResultRead, dependencies=[allow(BALANCE_FIX_ROLES)])
def apply_balances(data: BalanceRecalcApply, session: SessionDep):
    return balance_recalc_service.apply(session, data)
