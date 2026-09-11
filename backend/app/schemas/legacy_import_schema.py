from pydantic import BaseModel


class LegacyImportOrderCreated(BaseModel):
    project_name: str
    order_id: int
    folio: str
    outstanding_balance: float


class LegacyImportRead(BaseModel):
    orders_created: int
    invoices_created: int
    installments_created: int
    orders_created_details: list[LegacyImportOrderCreated]
    warnings: list[str]
    errors: list[str]
