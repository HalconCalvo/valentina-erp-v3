"""H56: a label (MDF bundles) or manifest (stone pieces) request stays in the print center until it is downloaded,
whatever the state of the house. Downloading marks it printed with date and user; reprints keep the first mark."""
from datetime import datetime
from typing import List, Optional

from sqlmodel import Session

from app.models.sales import SalesOrderItemInstance
from app.models.users import User

LABELS = "labels"
MANIFEST = "manifest"


def mark_requested(instance: SalesOrderItemInstance, kind: str) -> None:
    """A new request (or a new count of bundles / pieces) needs a new print."""
    setattr(instance, f"{kind}_requested_at", datetime.utcnow())
    setattr(instance, f"{kind}_printed_at", None)
    setattr(instance, f"{kind}_printed_by_user_id", None)


def mark_printed(session: Session, instance: SalesOrderItemInstance, kind: str, user: User) -> None:
    if getattr(instance, f"{kind}_printed_at") is None:
        setattr(instance, f"{kind}_printed_at", datetime.utcnow())
        setattr(instance, f"{kind}_printed_by_user_id", user.id)
        session.add(instance)
        session.commit()


def is_pending(instance: SalesOrderItemInstance, kind: str) -> bool:
    return getattr(instance, f"{kind}_requested_at") is not None and getattr(instance, f"{kind}_printed_at") is None


def unprinted(instance: SalesOrderItemInstance) -> List[str]:
    """What the house still has to print, in words for the warning."""
    names = {LABELS: "etiquetas de muebles", MANIFEST: "manifiesto de piedra"}
    return [names[kind] for kind in (LABELS, MANIFEST) if is_pending(instance, kind)]


def printed_by_name(session: Session, instance: SalesOrderItemInstance, kind: str) -> Optional[str]:
    user_id = getattr(instance, f"{kind}_printed_by_user_id")
    user = session.get(User, user_id) if user_id else None
    return user.full_name if user else None
