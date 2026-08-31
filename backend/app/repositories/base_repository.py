"""
Base repository for Valentina ERP v3.

All domain repositories inherit from this class.
Responsibility: single point of database access — queries only, no business logic.
Never raises HTTPException; returns None when entity is not found.
Max 30 lines per method.
"""
from abc import ABC, abstractmethod
from typing import Generic, Optional, TypeVar

from sqlmodel import Session

T = TypeVar("T")


class BaseRepository(ABC, Generic[T]):
    """Abstract base with the four standard data-access operations.

    Concrete repositories must implement each method for their entity type.
    Business logic belongs in services/, not here.
    """

    def __init__(self, session: Session) -> None:
        self.session = session

    @abstractmethod
    def find_by_id(self, entity_id: int) -> Optional[T]:
        """Return the entity with the given primary key, or None if not found."""
        ...

    @abstractmethod
    def find_all(self) -> list[T]:
        """Return all rows for this entity. Apply filters in the concrete subclass."""
        ...

    @abstractmethod
    def save(self, entity: T) -> T:
        """Persist a new or modified entity and return it refreshed from the DB."""
        ...

    @abstractmethod
    def delete(self, entity_id: int) -> None:
        """Soft-delete or mark as cancelled — never physically remove rows."""
        ...
