from typing import Optional
from sqlmodel import Field, SQLModel
from datetime import datetime


class PettyCashFund(SQLModel, table=True):
    __tablename__ = "petty_cash_fund"

    id: Optional[int] = Field(default=None, primary_key=True)
    fund_amount: float = Field(default=5000.0)
    minimum_balance: float = Field(default=1000.0)
    current_balance: float = Field(default=5000.0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by_id: Optional[int] = Field(default=None, foreign_key="users.id")


class PettyCashMovement(SQLModel, table=True):
    __tablename__ = "petty_cash_movements"

    id: Optional[int] = Field(default=None, primary_key=True)
    movement_type: str  # "EGRESO" | "REPOSICION"
    amount: float
    concept: str
    category: Optional[str] = Field(default=None)  # Solo aplica a EGRESO
    receipt_url: Optional[str] = Field(default=None)
    movement_date: datetime = Field(default_factory=datetime.utcnow)
    created_by_id: int = Field(foreign_key="users.id")
    notes: Optional[str] = Field(default=None)
