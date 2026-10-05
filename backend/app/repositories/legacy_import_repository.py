"""Legacy import — database queries only (no business logic)."""
from typing import List, Set

from sqlmodel import Session, select

from app.models.foundations import Client, TaxRate
from app.models.sales import SalesOrder, SalesOrderStatus
from app.models.users import User


def get_active_tax_rates(session: Session) -> List[TaxRate]:
    return list(
        session.exec(select(TaxRate).where(TaxRate.is_active == True)).all()  # noqa: E712
    )


def get_clients_by_full_name(session: Session, full_name: str) -> List[Client]:
    return list(session.exec(select(Client).where(Client.full_name == full_name)).all())


def get_users_by_full_name(session: Session, full_name: str) -> List[User]:
    return list(session.exec(select(User).where(User.full_name == full_name)).all())


def get_active_legacy_project_names(session: Session) -> Set[str]:
    rows = session.exec(
        select(SalesOrder.project_name).where(
            SalesOrder.is_legacy == True,  # noqa: E712
            SalesOrder.status != SalesOrderStatus.CANCELLED_OV,
        )
    ).all()
    return {(name or "").strip() for name in rows}
