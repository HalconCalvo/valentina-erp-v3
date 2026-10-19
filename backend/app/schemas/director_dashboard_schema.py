"""Director dashboard (ROADMAP task 11, Gabriel 2026-10-12): one source for the cards and their drill-downs.
Every amount is without VAT unless its name says otherwise; margins are "Margen neto % sobre venta"."""
from typing import List, Optional

from pydantic import BaseModel


class AmountLine(BaseModel):
    label: str
    amount: float


class SalesKpiRead(BaseModel):
    year: int
    sales_without_tax: float  # every sold OV of the year, tax 0% and 16% alike
    orders: int
    annual_target: float
    target_percent: Optional[float] = None


class LiquidityRead(BaseModel):
    """Liquidez = Bancos + CxC facturada pendiente + Inventario (3 cajones) − CxP."""
    banks: float
    bank_lines: List[AmountLine]
    receivables: float
    receivable_lines: List[AmountLine]  # by age
    inventory: float
    inventory_lines: List[AmountLine]  # raw material, work in progress, finished goods
    payables: float
    payable_lines: List[AmountLine]  # by due date
    net: float


class OrderMarginRead(BaseModel):
    order_id: int
    folio: str
    client_name: str
    sales_without_tax: float
    cost: float
    commission: float
    global_commission: float = 0.0  # D44: sales without VAT × configured global percent
    net_margin_percent: Optional[float] = None  # None when the OV has no cost (legacy import without recipe)


class ProfitabilityRead(BaseModel):
    """Only OVs with cost enter the margin; legacy OVs without cost are counted apart."""
    sales_without_tax: float
    cost: float
    commission: float
    global_commission: float = 0.0
    net_margin_percent: Optional[float] = None  # weighted by sales
    orders_without_cost: int
    sales_without_cost: float
    most_profitable: List[OrderMarginRead]
    least_profitable: List[OrderMarginRead]


class ReceivablesRead(BaseModel):
    pending: float
    documents: int
    cash_flow_income: float  # receivables inside the cash flow projection; must equal pending


class ClientSalesRead(BaseModel):
    client_id: int
    client_name: str
    orders: int
    sales_without_tax: float
    net_margin_percent: Optional[float] = None  # over the client's OVs with cost


class ClientPaymentSpeedRead(BaseModel):
    client_id: int
    client_name: str
    collected: float
    avg_days_to_collect: float  # invoice date → collection date, weighted by amount


class LaneSalesRead(BaseModel):
    lane: str  # MDF, Piedra, Sin receta
    sales_without_tax: float
    cost: float
    commission: float
    global_commission: float = 0.0
    net_margin_percent: Optional[float] = None


class TopClientsRead(BaseModel):
    by_sales: List[ClientSalesRead]
    by_margin: List[ClientSalesRead]
    by_payment_speed: List[ClientPaymentSpeedRead]
    by_lane: List[LaneSalesRead]


class DirectorSummaryRead(BaseModel):
    sales: SalesKpiRead
    liquidity: LiquidityRead
    profitability: ProfitabilityRead
    receivables: ReceivablesRead
    top_clients: TopClientsRead
