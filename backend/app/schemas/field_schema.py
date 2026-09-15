from typing import List, Optional

from pydantic import BaseModel, Field


class FieldMaterialLine(BaseModel):
    quantity: float
    unit: str
    name: str
    type: str


class FieldComponentsGroup(BaseModel):
    empaque: List[FieldMaterialLine] = Field(default_factory=list)
    herrajes: List[FieldMaterialLine] = Field(default_factory=list)


class FieldSalesOrderBrief(BaseModel):
    folio: str
    project_name: Optional[str] = None


class FieldClientBrief(BaseModel):
    business_name: Optional[str] = None


class FieldAssignmentRead(BaseModel):
    id: int
    custom_name: str
    street: Optional[str] = None
    lot: Optional[str] = None
    production_status: str
    sales_order: FieldSalesOrderBrief
    client: FieldClientBrief
    type: str
    blueprint_path: Optional[str] = None
    components: FieldComponentsGroup
    evidence_photos_urls: List[str] = Field(default_factory=list)
    signed_received_at: Optional[str] = None


class FieldMyAssignmentsRead(BaseModel):
    workday: str
    assignments: List[FieldAssignmentRead] = Field(default_factory=list)


class FieldSyncPayload(BaseModel):
    photos: List[str] = Field(default_factory=list)
    signature_base64: Optional[str] = None
    notes: Optional[str] = None
    scanned_packages: List[str] = Field(default_factory=list)
    incidents: List[str] = Field(default_factory=list)


class FieldSyncRead(BaseModel):
    success: bool
    signed_at: Optional[str] = None
    photo_urls: List[str] = Field(default_factory=list)


class FieldScanPackagePayload(BaseModel):
    barcode: str


class FieldScanPackageRead(BaseModel):
    success: bool
    barcode: str
    scanned_at: str
