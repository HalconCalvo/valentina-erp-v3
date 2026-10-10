from typing import List, Optional

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.core.deps import get_current_active_user, get_session
from app.models.sales import QuotationStatus
from app.models.users import User
from app.schemas.quotation_schema import (
    PriceSuggestionRead,
    PriceSuggestionRequest,
    QuotationAuthorize,
    QuotationCancel,
    QuotationConvert,
    QuotationConvertRead,
    QuotationCreate,
    QuotationRead,
    QuotationReason,
    QuotationRenew,
    QuotationUpdate,
)
from app.services import quotation_service, seller_pricing_service
from app.core.permissions import allow, SALES_READ_ROLES

router = APIRouter()


@router.post("/", response_model=QuotationRead, status_code=status.HTTP_201_CREATED)
def create_quotation(
    *,
    session: Session = Depends(get_session),
    data: QuotationCreate,
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.create_quotation(session, data, current_user)


@router.post("/price-suggestions", response_model=List[PriceSuggestionRead], dependencies=[allow(SALES_READ_ROLES)])
def suggest_prices(
    *,
    session: Session = Depends(get_session),
    data: PriceSuggestionRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Suggested unit prices; the seller gets them at the target markup without seeing costs (D13)."""
    return seller_pricing_service.suggest_prices(session, data, current_user)


@router.get("/", response_model=List[QuotationRead], dependencies=[allow(SALES_READ_ROLES)])
def list_quotations(
    *,
    session: Session = Depends(get_session),
    status_filter: Optional[QuotationStatus] = None,
    skip: int = 0,
    limit: int = 1000,
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.list_quotations(session, current_user, status=status_filter, skip=skip, limit=limit)


@router.get("/{quotation_id}", response_model=QuotationRead, dependencies=[allow(SALES_READ_ROLES)])
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


@router.post("/{quotation_id}/request-auth", response_model=QuotationRead)
def request_authorization(
    quotation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.request_authorization(session, quotation_id, current_user)


@router.post("/{quotation_id}/authorize", response_model=QuotationRead)
def authorize_quotation(
    quotation_id: int,
    data: QuotationAuthorize,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.authorize_quotation(session, quotation_id, data, current_user)


@router.post("/{quotation_id}/request-changes", response_model=QuotationRead)
def request_changes(
    quotation_id: int,
    data: QuotationReason,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.request_changes(session, quotation_id, data, current_user)


@router.post("/{quotation_id}/mark-lost", response_model=QuotationRead)
def mark_lost(
    quotation_id: int,
    data: QuotationReason,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.mark_lost(session, quotation_id, data, current_user)


@router.post("/{quotation_id}/cancel", response_model=QuotationRead)
def cancel_quotation(
    quotation_id: int,
    data: QuotationCancel,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.cancel_quotation(session, quotation_id, data, current_user)


@router.post("/{quotation_id}/renew", response_model=QuotationRead)
def renew_quotation(
    quotation_id: int,
    data: QuotationRenew,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.renew_quotation(session, quotation_id, data, current_user)


@router.post("/{quotation_id}/convert", response_model=QuotationConvertRead)
def convert_quotation(
    quotation_id: int,
    data: QuotationConvert,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return quotation_service.convert_quotation_to_order(session, quotation_id, data, current_user)


@router.get("/{quotation_id}/pdf", dependencies=[allow(SALES_READ_ROLES)])
def download_quotation_pdf(
    quotation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    pdf_buffer, filename = quotation_service.generate_quotation_pdf(session, quotation_id, current_user)
    return StreamingResponse(
        pdf_buffer, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )
