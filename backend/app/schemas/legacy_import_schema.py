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
    folio: Optional[str] = None  # existing OV (Folio_OV); None for a new one
    action: str  # CREAR | SINCRONIZAR | SIN CAMBIOS
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
    changes: int = 0
    cancels: int = 0
    details: list[str] = []


class LegacyImportPreviewRead(BaseModel):
    orders: list[LegacyImportPreviewOrderRead]
    orders_to_create: int
    orders_to_sync: int
    changes_to_apply: int
    orders_released: int
    invoices_to_create: int
    installments_to_create: int
    can_import: bool
    warnings: list[LegacyImportIssueRead]
    errors: list[LegacyImportIssueRead]


class LegacyImportRead(BaseModel):
    orders_created: int
    orders_synced: int
    changes_applied: int
    orders_released: int
    invoices_created: int
    installments_created: int
    orders_created_details: list[LegacyImportOrderCreated]
    warnings: list[LegacyImportIssueRead]
    errors: list[LegacyImportIssueRead]
