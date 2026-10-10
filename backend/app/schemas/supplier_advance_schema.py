"""Sanitation tool 2 (docs/SANEAMIENTO.md §4.1): supplier advance invoices marked PAID without any payment."""
from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class UnpaidAdvanceRead(BaseModel):
    invoice_id: int
    invoice_number: str
    provider_name: Optional[str] = None
    total_amount: float
    issue_date: Optional[date] = None
    open_payments: int = 0  # pending or approved requests: rejected when the advance is absorbed


class UnpaidAdvanceApply(BaseModel):
    invoice_ids: List[int] = Field(..., min_length=1)
    reason: str = Field(..., min_length=1)


class UnpaidAdvanceResultRead(BaseModel):
    updated: int
    skipped: List[str] = []
