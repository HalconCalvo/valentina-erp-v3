from datetime import datetime
from typing import Optional

from sqlalchemy import Index
from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    user_name: str = Field(default="")
    user_role: str = Field(default="")

    action: str = Field(index=True)
    entity_type: str = Field(index=True)
    entity_id: Optional[int] = Field(default=None)
    entity_reference: Optional[str] = Field(default=None)

    description: str = Field(default="")

    old_values: Optional[str] = Field(default=None)
    new_values: Optional[str] = Field(default=None)

    ip_address: Optional[str] = Field(default=None)


class AuditFieldChange(SQLModel, table=True):
    """Automatic change log: one row per changed field (UPDATE), or per record (INSERT/DELETE)."""
    __tablename__ = "audit_field_changes"
    __table_args__ = (
        Index("ix_audit_field_changes_record", "table_name", "record_id", "changed_at"),
        Index("ix_audit_field_changes_user", "user_id", "changed_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    changed_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[int] = Field(default=None)
    source: str = Field(default="system")
    ip_address: Optional[str] = Field(default=None)
    change_id: str = Field(index=True)
    reason: Optional[str] = Field(default=None)
    table_name: str
    record_id: Optional[str] = Field(default=None)
    operation: str
    field_name: Optional[str] = Field(default=None)
    old_value: Optional[str] = Field(default=None)
    new_value: Optional[str] = Field(default=None)
