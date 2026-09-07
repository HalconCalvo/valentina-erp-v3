from typing import List, Optional

from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.deps import get_current_active_user, get_session
from app.models.sales import Quotation, QuotationStatus
from app.models.users import User
from app.schemas.quotation_schema import (
    QuotationCancel,
    QuotationConvertRead,
    QuotationCreate,
    QuotationRead,
    QuotationUpdate,
)
from app.services import quotation_service

router = APIRouter()


@router.post("/", response_model=QuotationRead, status_code=status.HTTP_201_CREATED)
def create_quotation(
    *,
    session: Session = Depends(get_session),
    data: QuotationCreate,
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.create_quotation(session, data, current_user)


@router.get("/", response_model=List[QuotationRead])
def list_quotations(
    *,
    session: Session = Depends(get_session),
    status_filter: Optional[QuotationStatus] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.list_quotations(
        session, current_user, status=status_filter, skip=skip, limit=limit
    )


@router.get("/{quotation_id}", response_model=QuotationRead)
def get_quotation_detail(
    quotation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.get_quotation(session, quotation_id, current_user)


@router.patch("/{quotation_id}", response_model=QuotationRead)
def update_quotation(
    quotation_id: int,
    data: QuotationUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.update_quotation(session, quotation_id, data, current_user)


@router.post("/{quotation_id}/send", response_model=QuotationRead)
def send_quotation(
    quotation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.send_quotation(session, quotation_id, current_user)


@router.post("/{quotation_id}/accept", response_model=QuotationRead)
def accept_quotation(
    quotation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.accept_quotation(session, quotation_id, current_user)


@router.post("/{quotation_id}/reject", response_model=QuotationRead)
def reject_quotation(
    quotation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.reject_quotation(session, quotation_id, current_user)


@router.post("/{quotation_id}/cancel", response_model=QuotationRead)
def cancel_quotation(
    quotation_id: int,
    data: QuotationCancel,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.cancel_quotation(session, quotation_id, data, current_user)


@router.post("/{quotation_id}/convert", response_model=QuotationConvertRead)
def convert_quotation(
    quotation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.convert_quotation_to_order(session, quotation_id, current_user)


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(
    quotation_id: int,
    session: Session = Depends(get_session),
):
    return quotation_service.generate_quotation_pdf(session, quotation_id)
