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


class LegacyImportDiscrepancyRead(BaseModel):
    folio: str
    project: str
    kind: str
    record: str
    concept: str
    valentina: str
    excel: str


class LegacyImportPreviewOrderRead(BaseModel):
    row: Optional[int] = None  # None for an OV that did not come in the Excel
    folio: Optional[str] = None  # existing OV (Folio_OV); None for a new one
    action: str  # CREAR | AGREGAR | REVISAR | SIN CAMBIOS | No viene en el Excel — revisar
    project_name: str
    client_name: Optional[str] = None
    seller_name: Optional[str] = None
    tax_rate_name: Optional[str] = None
    total_price: float
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    invoices: int
    installments: int
    outstanding_balance: float
    payment_status: str
    adds: int = 0
    discrepancies: int = 0
    details: list[str] = []


class LegacyImportPreviewRead(BaseModel):
    orders: list[LegacyImportPreviewOrderRead]
    orders_to_create: int
    orders_with_additions: int
    additions: int
    discrepancies: list[LegacyImportDiscrepancyRead]
    invoices_to_create: int
    installments_to_create: int
    can_import: bool
    warnings: list[LegacyImportIssueRead]
    errors: list[LegacyImportIssueRead]


class LegacyImportRead(BaseModel):
    orders_created: int
    orders_with_additions: int
    additions: int
    discrepancies: list[LegacyImportDiscrepancyRead]
    invoices_created: int
    installments_created: int
    orders_created_details: list[LegacyImportOrderCreated]
    warnings: list[LegacyImportIssueRead]
    errors: list[LegacyImportIssueRead]
