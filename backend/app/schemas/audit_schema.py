from datetime import datetime
from typing import List, Optional

from sqlmodel import SQLModel


class AuditLogRead(SQLModel):
    id: int
    created_at: datetime
    user_id: Optional[int] = None
    user_name: str = ""
    user_role: str = ""
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    entity_reference: Optional[str] = None
    description: str = ""
    old_values: Optional[str] = None
    new_values: Optional[str] = None
    ip_address: Optional[str] = None


class AuditLogListResponse(SQLModel):
    items: List[AuditLogRead] = []
    total: int = 0
    skip: int = 0
    limit: int = 50


class AuditFieldChangeRead(SQLModel):
    id: int
    changed_at: datetime
    user_id: Optional[int] = None
    user_name: str = ""
    user_role: str = ""
    source: str
    ip_address: Optional[str] = None
    change_id: str
    reason: Optional[str] = None
    table_name: str
    record_id: Optional[str] = None
    operation: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None


class AuditFieldChangeListResponse(SQLModel):
    items: List[AuditFieldChangeRead] = []
    total: int = 0
    skip: int = 0
    limit: int = 100
