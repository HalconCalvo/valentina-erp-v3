"""Quotation domain — database queries only (no business logic)."""
from typing import List, Optional

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.models.foundations import Client, GlobalConfig, TaxRate
from app.models.sales import Quotation, QuotationItem, QuotationStatus
from app.models.users import User


def get_quotations(
    session: Session,
    status: Optional[QuotationStatus] = None,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[Quotation]:
    stmt = select(Quotation).options(
        selectinload(Quotation.client),
        selectinload(Quotation.items),
        selectinload(Quotation.user),
    )
    if status is not None:
        stmt = stmt.where(Quotation.status == status)
    if user_id is not None:
        stmt = stmt.where(Quotation.user_id == user_id)
    return list(
        session.exec(stmt.order_by(Quotation.id.desc()).offset(skip).limit(limit)).unique().all()
    )


def get_quotation_by_id(session: Session, quotation_id: int) -> Optional[Quotation]:
    stmt = (
        select(Quotation)
        .where(Quotation.id == quotation_id)
        .options(
            selectinload(Quotation.client),
            selectinload(Quotation.items),
            selectinload(Quotation.user),
        )
    )
    return session.exec(stmt).unique().first()


def get_tax_rate_by_id(session: Session, tax_rate_id: int) -> Optional[TaxRate]:
    return session.get(TaxRate, tax_rate_id)


def get_client_by_id(session: Session, client_id: int) -> Optional[Client]:
    return session.get(Client, client_id)


def get_user_by_id(session: Session, user_id: int) -> Optional[User]:
    return session.get(User, user_id)


def get_global_config(session: Session) -> Optional[GlobalConfig]:
    return session.exec(select(GlobalConfig)).first()


def deactivate_quotation_items(session: Session, quotation_id: int) -> None:
    items = list(
        session.exec(select(QuotationItem).where(QuotationItem.quotation_id == quotation_id)).all()
    )
    for item in items:
        item.is_cancelled = True
        session.add(item)
    session.flush()


def get_active_quotation_items(session: Session, quotation_id: int) -> List[QuotationItem]:
    return list(
        session.exec(
            select(QuotationItem).where(
                QuotationItem.quotation_id == quotation_id,
                QuotationItem.is_cancelled == False,  # noqa: E712
            )
        ).all()
    )
