"""Change orders (CAM) of a sales order. Request authorization, return, cancel and renew reuse /quotations."""
from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.deps import get_current_active_user, get_session
from app.models.sales import QuotationStatus
from app.models.users import User
from app.schemas.quotation_schema import (
    ChangeOrderApply,
    ChangeOrderAuthorize,
    ChangeOrderCreate,
    ChangeOrderUpdate,
    QuotationRead,
)
from app.services import change_order_service

router = APIRouter()


@router.post("/", response_model=QuotationRead, status_code=status.HTTP_201_CREATED)
def create_change_order(
    data: ChangeOrderCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return change_order_service.create_change_order(session, data, current_user)


@router.get("/", response_model=List[QuotationRead])
def list_change_orders(
    sales_order_id: Optional[int] = None,
    status_filter: Optional[QuotationStatus] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return change_order_service.list_change_orders(session, current_user, sales_order_id, status_filter)


@router.get("/{change_id}", response_model=QuotationRead)
def get_change_order(
    change_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return change_order_service.get_change_order(session, change_id, current_user)


@router.patch("/{change_id}", response_model=QuotationRead)
def update_change_order(
    change_id: int,
    data: ChangeOrderUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return change_order_service.update_change_order(session, change_id, data, current_user)


@router.post("/{change_id}/authorize", response_model=QuotationRead)
def authorize_change_order(
    change_id: int,
    data: ChangeOrderAuthorize,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return change_order_service.authorize_change_order(session, change_id, data, current_user)


@router.post("/{change_id}/apply", response_model=QuotationRead)
def apply_change_order(
    change_id: int,
    data: ChangeOrderApply,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return change_order_service.apply_change_order(session, change_id, data, current_user)
