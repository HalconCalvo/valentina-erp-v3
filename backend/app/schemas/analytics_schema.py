from typing import Dict, List
from sqlmodel import SQLModel


class CxcAgingStats(SQLModel):
    total_pending: float
    breakdown: Dict[str, float]
    count: int


class OrderProfitabilityItem(SQLModel):
    """margin_percent = margen neto % sobre venta (sin IVA, después de comisión)."""
    order_id: int
    folio: str
    client_name: str
    total_price: float  # venta sin IVA
    estimated_cost: float
    commission_amount: float = 0.0
    net_profit: float = 0.0
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
    total_revenue: float  # venta sin IVA
    avg_margin_percent: float  # margen neto % sobre venta, ponderado por venta
