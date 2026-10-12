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


class FieldLaneRead(BaseModel):
    assignment_id: int
    lane: str  # IM furniture, IP stone
    status: str  # UNASSIGNED (no crew yet), SCHEDULED (not loaded), IN_PROGRESS (loaded), INSTALLED, COMPLETED
    leader_name: Optional[str] = None
    is_mine: bool = False


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
    lanes: List[FieldLaneRead] = Field(default_factory=list)
    can_sign: bool = False


class FieldMyAssignmentsRead(BaseModel):
    workday: str
    assignments: List[FieldAssignmentRead] = Field(default_factory=list)


class FieldSyncPayload(BaseModel):
    photos: List[str] = Field(default_factory=list)
    signature_base64: Optional[str] = None
    notes: Optional[str] = None
    scanned_packages: List[str] = Field(default_factory=list)  # ignored: loading is scanned only in Logistics
    incidents: List[str] = Field(default_factory=list)


class FieldSyncRead(BaseModel):
    success: bool
    signed_at: Optional[str] = None
    photo_urls: List[str] = Field(default_factory=list)


class FieldLaneInstalledRead(BaseModel):
    ok: bool
    assignment_id: int
    status: str
    message: str
