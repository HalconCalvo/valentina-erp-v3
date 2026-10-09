from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from sqlmodel import SQLModel
from datetime import datetime

from app.models.sales import ChangeType, QuotationKind, QuotationStatus
from app.schemas.sales_schema import ClientReadBasic


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
    change_type: Optional[ChangeType] = None
    target_order_item_id: Optional[int] = None
    cancel_instance_ids: Optional[List[int]] = None
    reversal_dispositions: Optional[Dict[str, str]] = None
    change_reason: Optional[str] = None


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
    # Complementary OV: the original sales order this new quotation extends
    parent_sales_order_id: Optional[int] = None


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


class QuotationUserRead(SQLModel):
    id: int
    full_name: Optional[str] = None


class QuotationRead(QuotationBase):
    id: int
    folio: str = ""
    status: QuotationStatus
    created_at: datetime
    subtotal: float
    tax_amount: float
    total_price: float
    commission_amount: float
    user_id: Optional[int] = None
    sales_order_id: Optional[int] = None
    auth_requested_at: Optional[datetime] = None
    authorized_at: Optional[datetime] = None
    authorized_by_user_id: Optional[int] = None
    director_notes: Optional[str] = None
    changes_requested_at: Optional[datetime] = None
    changes_requested_reason: Optional[str] = None
    changes_requested_by_user_id: Optional[int] = None
    lost_at: Optional[datetime] = None
    lost_reason: Optional[str] = None
    converted_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    kind: QuotationKind = QuotationKind.NEW
    parent_sales_order_id: Optional[int] = None
    change_number: Optional[int] = None
    change_reason: Optional[str] = None
    applied_at: Optional[datetime] = None
    applied_by_user_id: Optional[int] = None
    client_po_folio: Optional[str] = None
    client_po_date: Optional[datetime] = None
    complementary_advance_amount: float = 0.0
    client: Optional[ClientReadBasic] = None
    user: Optional[QuotationUserRead] = None
    items: List[QuotationItemRead] = []


class QuotationAuthorize(BaseModel):
    """Director's financial review: final prices, margin, commission and advance."""
    items: List[QuotationItemCreate] = Field(..., min_length=1)
    applied_margin_percent: float
    applied_commission_percent: float
    advance_percent: float
    advance_invoice_amount: Optional[float] = None
    director_notes: Optional[str] = None


class QuotationReason(BaseModel):
    reason: str = Field(..., min_length=1)


class QuotationCancel(BaseModel):
    cancel_reason: str = Field(..., min_length=1)


class QuotationRenew(BaseModel):
    valid_until: datetime


class QuotationConvert(BaseModel):
    """Client purchase order: required to turn an authorized quotation into a sales order."""
    client_po_folio: str = Field(..., min_length=1)
    client_po_date: datetime


class QuotationConvertRead(BaseModel):
    quotation_id: int
    sales_order_id: int
    message: str



# ==========================================
# ORDEN DE CAMBIO DE OV (CAM)
# ==========================================
class ChangeOrderLine(BaseModel):
    """One operation of a change order.
    ADD: new line (product_name, quantity, unit_price, ...). QUANTITY_UP: quantity = NEW quantity of the line.
    QUANTITY_DOWN: production lines list the units in cancel_instance_ids; resale lines give the NEW quantity.
    PRICE: unit_price = new price. CANCEL_LINE: the whole line."""
    change_type: ChangeType
    target_order_item_id: Optional[int] = None
    product_name: Optional[str] = None
    origin_version_id: Optional[int] = None
    quantity: float = 0.0
    unit_price: float = 0.0
    cost_snapshot: Dict[str, Any] = {}
    frozen_unit_cost: float = 0.0
    is_resale: bool = False
    resale_sku: Optional[str] = None
    commercial_description: Optional[str] = None
    cancel_instance_ids: List[int] = []
    reversal_dispositions: Dict[str, str] = {}
    change_reason: Optional[str] = None


class ChangeOrderCreate(BaseModel):
    sales_order_id: int
    change_reason: str = Field(..., min_length=1)
    lines: List[ChangeOrderLine] = Field(..., min_length=1)
    advance_percent: Optional[float] = None
    notes: Optional[str] = None


class ChangeOrderUpdate(BaseModel):
    change_reason: Optional[str] = None
    lines: Optional[List[ChangeOrderLine]] = None
    advance_percent: Optional[float] = None
    notes: Optional[str] = None


class ChangeOrderAuthorize(BaseModel):
    """Director's review: final prices of the lines, advance percent and what happens to units in production."""
    lines: List[ChangeOrderLine] = Field(..., min_length=1)
    advance_percent: float
    director_notes: Optional[str] = None


class ChangeOrderApply(BaseModel):
    """Client's complementary purchase order, optional."""
    client_po_folio: Optional[str] = None
    client_po_date: Optional[datetime] = None
