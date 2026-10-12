"""D16: a customer invoice or sales order whose balance is at most GlobalConfig.paid_balance_tolerance (only
DIRECTOR changes it; initial $1.00) counts as paid. Used when registering payments and by the sanitation tool."""
from sqlmodel import Session

from app.repositories import sales_repository as sales_repo

DEFAULT_PAID_TOLERANCE = 1.0


def paid_tolerance(session: Session) -> float:
    config = sales_repo.get_global_config(session)
    value = getattr(config, "paid_balance_tolerance", None) if config else None
    return float(value) if value is not None else DEFAULT_PAID_TOLERANCE


def is_settled(balance: float, tolerance: float) -> bool:
    return round(float(balance or 0.0), 2) <= tolerance
