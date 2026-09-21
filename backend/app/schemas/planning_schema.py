from typing import Optional

from pydantic import BaseModel


class ScheduleMapRead(BaseModel):
    PM: Optional[str] = None
    PP: Optional[str] = None
    IM: Optional[str] = None
    IP: Optional[str] = None


class InstanceScheduleRead(BaseModel):
    id: int
    custom_name: str
    product_name: Optional[str] = None
    product_category: Optional[str] = None
    order_folio: Optional[str] = None
    client_name: Optional[str] = None
    project_name: Optional[str] = None
    production_status: str
    semaphore: str
    semaphore_label: str
    schedule: ScheduleMapRead
    sales_order_item_id: int
    delivery_deadline: Optional[str] = None
    signed_received_at: Optional[str] = None
    warranty_started_at: Optional[str] = None
    is_warranty_reopened: bool = False
    warranty_reopened_at: Optional[str] = None
    original_signed_at: Optional[str] = None
    is_cancelled: bool = False
    stone_pieces: Optional[int] = None
    is_resale: Optional[bool] = None
