from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from sqlmodel import SQLModel
from datetime import datetime

from app.models.sales import QuotationStatus
from app.schemas.sales_schema import ClientReadBasic, SalesOrderItemCreate


class QuotationItemBase(SQLModel):
    product_name: str
    origin_version_id: Optional[int] = None
    quantity: float
    unit_price: float
    cost_snapshot: Dict[str, Any] = {}
    frozen_unit_cost: float = 0.0
    is_resale: bool = False
    resale_sku: Optional[str] = None
    commercial_description: Optional[str] = None


class QuotationItemCreate(QuotationItemBase):
    pass


class QuotationItemRead(QuotationItemBase):
    id: int
    quotation_id: int
    subtotal_price: float


class QuotationBase(SQLModel):
    project_name: str
    client_id: int
    tax_rate_id: int
    valid_until: datetime
    delivery_date: Optional[datetime] = None
    applied_margin_percent: float = 0.0
    applied_tolerance_percent: float = 0.0
    applied_commission_percent: float = 0.0
    advance_percent: float = 60.0
    has_advance_invoice: bool = False
    advance_invoice_amount: Optional[float] = None
    currency: str = "MXN"
    notes: Optional[str] = None
    conditions: Optional[str] = None
    external_invoice_ref: Optional[str] = None
    is_warranty: bool = False


class QuotationCreate(QuotationBase):
    items: List[QuotationItemCreate] = []


class QuotationUpdate(SQLModel):
    project_name: Optional[str] = None
    client_id: Optional[int] = None
    tax_rate_id: Optional[int] = None
    valid_until: Optional[datetime] = None
    delivery_date: Optional[datetime] = None
    applied_margin_percent: Optional[float] = None
    applied_tolerance_percent: Optional[float] = None
    applied_commission_percent: Optional[float] = None
    advance_percent: Optional[float] = None
    has_advance_invoice: Optional[bool] = None
    advance_invoice_amount: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    conditions: Optional[str] = None
    external_invoice_ref: Optional[str] = None
    is_warranty: Optional[bool] = None
    items: Optional[List[QuotationItemCreate]] = None


class QuotationRead(QuotationBase):
    id: int
    status: QuotationStatus
    created_at: datetime
    subtotal: float
    tax_amount: float
    total_price: float
    commission_amount: float
    user_id: Optional[int] = None
    sales_order_id: Optional[int] = None
    sent_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    reject_reason: Optional[str] = None
    rejected_by_user_id: Optional[int] = None
    expired_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    client: Optional[ClientReadBasic] = None
    user: Optional[Any] = None
    items: List[QuotationItemRead] = []


class QuotationCancel(BaseModel):
    cancel_reason: str = Field(..., min_length=1)


class QuotationReject(BaseModel):
    reject_reason: str = Field(..., min_length=1)


class QuotationConvertRead(BaseModel):
    quotation_id: int
    sales_order_id: int
    message: str
