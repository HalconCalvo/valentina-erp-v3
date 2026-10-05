from typing import Optional

from pydantic import BaseModel


class LegacyImportIssueRead(BaseModel):
    sheet: str
    row: Optional[int] = None
    project: Optional[str] = None
    message: str


class LegacyImportOrderCreated(BaseModel):
    project_name: str
    order_id: int
    folio: str
    outstanding_balance: float


class LegacyImportPreviewOrderRead(BaseModel):
    row: int
    project_name: str
    client_name: str
    seller_name: str
    tax_rate_name: str
    total_price: float
    subtotal: float
    tax_amount: float
    invoices: int
    installments: int
    outstanding_balance: float
    payment_status: str


class LegacyImportPreviewRead(BaseModel):
    orders: list[LegacyImportPreviewOrderRead]
    orders_to_create: int
    invoices_to_create: int
    installments_to_create: int
    can_import: bool
    warnings: list[LegacyImportIssueRead]
    errors: list[LegacyImportIssueRead]


class LegacyImportRead(BaseModel):
    orders_created: int
    invoices_created: int
    installments_created: int
    orders_created_details: list[LegacyImportOrderCreated]
    warnings: list[LegacyImportIssueRead]
    errors: list[LegacyImportIssueRead]
