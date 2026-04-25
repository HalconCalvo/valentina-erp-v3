from typing import Optional
from pydantic import BaseModel
from datetime import datetime


class PettyCashFundRead(BaseModel):
    id: int
    fund_amount: float
    minimum_balance: float
    current_balance: float
    updated_at: datetime
    updated_by_id: Optional[int] = None

    class Config:
        from_attributes = True


class PettyCashFundUpdate(BaseModel):
    fund_amount: Optional[float] = None
    minimum_balance: Optional[float] = None


class PettyCashMovementCreate(BaseModel):
    movement_type: str  # "EGRESO" | "REPOSICION"
    amount: float
    concept: str
    category: Optional[str] = None
    notes: Optional[str] = None
    movement_date: Optional[datetime] = None


class PettyCashMovementRead(BaseModel):
    id: int
    movement_type: str
    amount: float
    concept: str
    category: Optional[str] = None
    receipt_url: Optional[str] = None
    movement_date: datetime
    created_by_id: int
    notes: Optional[str] = None
    created_by_name: Optional[str] = None

    class Config:
        from_attributes = True
