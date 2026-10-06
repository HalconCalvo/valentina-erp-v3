from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class AuditCreate(BaseModel):
    cut_date: date
    notes: Optional[str] = None


class AuditReopenCreate(BaseModel):
    reason: str


class AuditItemRecountCreate(BaseModel):
    counted_quantity: float
    reason: str


class AuditSettingsUpdate(BaseModel):
    inventory_audit_value_threshold: float


class AuditSettingsRead(BaseModel):
    inventory_audit_value_threshold: float


class PeriodLockRead(BaseModel):
    locked: bool
    locked_until: Optional[datetime] = None
    locked_until_local: Optional[str] = None
    audit_id: Optional[int] = None
