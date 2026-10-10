"""Sanitation tool 1 (docs/SANEAMIENTO.md §6.1): recalculate customer invoice states and sales order balances."""
from typing import List, Optional

from pydantic import BaseModel, Field


class InvoiceStatusFixRead(BaseModel):
    cxc_id: int
    sales_order_id: int
    order_folio: str
    invoice_folio: Optional[str] = None
    payment_type: str
    amount: float
    amortized_advance: float
    collected: float
    credited: float
    balance: float
    status: str
    new_status: str


class OrderBalanceFixRead(BaseModel):
    sales_order_id: int
    order_folio: str
    project_name: str
    client_name: Optional[str] = None
    is_legacy: bool
    total_price: float
    collected: float
    stored_balance: float
    computed_balance: float
    status: str
    new_status: str


class RecalcAnomalyRead(BaseModel):
    cxc_id: int
    sales_order_id: int
    order_folio: str
    message: str


class BalanceRecalcPreviewRead(BaseModel):
    invoices: List[InvoiceStatusFixRead] = []
    orders: List[OrderBalanceFixRead] = []
    anomalies: List[RecalcAnomalyRead] = []


class BalanceRecalcApply(BaseModel):
    invoice_ids: List[int] = []
    order_ids: List[int] = []
    reason: str = Field(..., min_length=1)


class BalanceRecalcResultRead(BaseModel):
    invoices_updated: int
    orders_updated: int
    skipped: List[str] = []
