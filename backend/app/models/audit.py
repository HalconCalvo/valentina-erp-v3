from datetime import datetime
from typing import Optional

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
