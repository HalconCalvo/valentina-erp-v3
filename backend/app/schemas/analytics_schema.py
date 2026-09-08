from typing import Dict, List
from sqlmodel import SQLModel


class CxcAgingStats(SQLModel):
    total_pending: float
    breakdown: Dict[str, float]
    count: int


class OrderProfitabilityItem(SQLModel):
    order_id: int
    folio: str
    client_name: str
    total_price: float
    estimated_cost: float
    margin_percent: float


class CashFlowEntry(SQLModel):
    date: str
    amount: float
    reference: str


class CashFlowProjection(SQLModel):
    current_balance: float
    projection_30: float
    projection_60: float
    projection_90: float
    expected_income: List[CashFlowEntry]
    committed_expenses: List[CashFlowEntry]


class TopClientItem(SQLModel):
    client_id: int
    client_name: str
    total_orders: int
    total_revenue: float
    avg_margin_percent: float
