from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

ReversalDisposition = Literal["RETURN_TO_STOCK", "WASTE"]


class ReversalCreate(BaseModel):
    reason: str
    disposition: ReversalDisposition


class ProductionOverrideCreate(BaseModel):
    """Director/Manager authorization to enter production without enough stock."""
    override_reason: Optional[str] = None


class BatchStatusUpdate(BaseModel):
    status: Optional[str] = None
    override_reason: Optional[str] = None
    reversal: Optional[ReversalCreate] = None


class InstanceRemovalCreate(BaseModel):
    reason: str
    reversal: Optional[ReversalCreate] = None


class OVCancelCreate(BaseModel):
    reversal: Optional[ReversalCreate] = None


class ValuationLineRead(BaseModel):
    instance_id: int
    instance_name: str
    batch_folio: str
    value: float


class RawMaterialLineRead(BaseModel):
    material_id: int
    sku: str
    name: str
    usage_unit: str
    stock: float
    usage_unit_cost: float
    value: float


class ValuationSummaryRead(BaseModel):
    raw_materials: float
    work_in_progress: float
    finished_goods: float
    total: float
    cost_of_sales: float
    waste: float
    negative_stock_materials: int
    raw_material_lines: list[RawMaterialLineRead]
    work_in_progress_lines: list[ValuationLineRead]
    finished_goods_lines: list[ValuationLineRead]


class StockAuthorizationRead(BaseModel):
    id: int
    batch_folio: str
    authorized_by: str
    reason: str
    shortages: list[dict]
    created_at: datetime


class NegativeStockRead(BaseModel):
    materials: list[RawMaterialLineRead]
    authorizations: list[StockAuthorizationRead]
