from datetime import date, datetime, time
from typing import List, Literal, Tuple

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import select

from app.core.deps import SessionDep, CurrentUser
from app.models.finance import SupplierPayment, PaymentStatus, PaymentMethod, PurchaseInvoice
from app.models.foundations import Provider, GlobalConfig
from app.models.users import User
from app.services.pdf_generator import PDFGenerator

router = APIRouter()

ALLOWED_ROLES = {
    "DIRECTOR", "DIRECCION", "DIRECTION",
    "GERENCIA",
    "ADMIN", "ADMINISTRADOR",
}

PAYMENT_METHOD_ES = {
    PaymentMethod.TRANSFER: "Transferencia",
    PaymentMethod.CASH: "Efectivo",
    PaymentMethod.CHECK: "Cheque",
    PaymentMethod.CREDIT_CARD: "Tarjeta",
    PaymentMethod.OTHER: "Otro",
}

STATUS_ES = {
    PaymentStatus.PAID: "Ejecutado",
    PaymentStatus.PENDING: "Solicitado",
    PaymentStatus.APPROVED: "Autorizado",
}

STATUS_FILTER_LABELS = {
    "paid": "Pagados",
    "pending": "Por Pagar",
    "all": "Ambos",
}


def _check_report_role(current_user: User) -> None:
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role.upper() not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="No tienes permisos para consultar este reporte.")


def _statuses_for_filter(status_filter: str) -> List[PaymentStatus]:
    if status_filter == "paid":
        return [PaymentStatus.PAID]
    if status_filter == "pending":
        return [PaymentStatus.PENDING, PaymentStatus.APPROVED]
    if status_filter == "all":
        return [PaymentStatus.PAID, PaymentStatus.PENDING, PaymentStatus.APPROVED]
    raise HTTPException(
        status_code=400,
        detail="status_filter inválido. Use: paid, pending o all.",
    )


def _translate_method(method: PaymentMethod | str) -> str:
    if isinstance(method, str):
        try:
            method = PaymentMethod(method)
        except ValueError:
            return method
    return PAYMENT_METHOD_ES.get(method, str(method))


def _translate_status(status: PaymentStatus | str) -> str:
    if isinstance(status, str):
        try:
            status = PaymentStatus(status)
        except ValueError:
            return status
    return STATUS_ES.get(status, str(status))


class SupplierPaymentReportRow(BaseModel):
    payment_date: date
    invoice_number: str
    amount: float
    payment_method: str
    reference: str | None
    status: str


class SupplierPaymentsReportResponse(BaseModel):
    provider: dict
    date_from: date
    date_to: date
    status_filter: str
    payments: List[SupplierPaymentReportRow]
    total_amount: float
    count: int


def _build_supplier_payments_data(
    session: SessionDep,
    provider_id: int,
    date_from: date,
    date_to: date,
    status_filter: str,
) -> Tuple[Provider, List[SupplierPaymentReportRow], float]:
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from no puede ser posterior a date_to.")

    provider = session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")

    statuses = _statuses_for_filter(status_filter)
    start_dt = datetime.combine(date_from, time.min)
    end_dt = datetime.combine(date_to, time.max)

    rows = session.exec(
        select(SupplierPayment, PurchaseInvoice.invoice_number)
        .join(PurchaseInvoice, SupplierPayment.purchase_invoice_id == PurchaseInvoice.id)
        .where(SupplierPayment.provider_id == provider_id)
        .where(SupplierPayment.payment_date >= start_dt)
        .where(SupplierPayment.payment_date <= end_dt)
        .where(SupplierPayment.status.in_(statuses))
        .order_by(SupplierPayment.payment_date.asc())
    ).all()

    payments: List[SupplierPaymentReportRow] = []
    total_amount = 0.0

    for payment, invoice_number in rows:
        pay_date = payment.payment_date.date() if isinstance(payment.payment_date, datetime) else payment.payment_date
        payments.append(SupplierPaymentReportRow(
            payment_date=pay_date,
            invoice_number=invoice_number or "",
            amount=payment.amount,
            payment_method=_translate_method(payment.payment_method),
            reference=payment.reference,
            status=_translate_status(payment.status),
        ))
        total_amount += payment.amount

    return provider, payments, round(total_amount, 2)


@router.get("/supplier_payments", response_model=SupplierPaymentsReportResponse)
def supplier_payments_report(
    current_user: CurrentUser,
    session: SessionDep,
    provider_id: int = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    status_filter: Literal["paid", "pending", "all"] = Query("all"),
):
    """
    Reporte de pagos a proveedor por rango de fechas y estado.
    Roles: DIRECTOR, GERENCIA, ADMIN (y alias).
    """
    _check_report_role(current_user)

    provider, payments, total_amount = _build_supplier_payments_data(
        session, provider_id, date_from, date_to, status_filter,
    )

    return SupplierPaymentsReportResponse(
        provider={"id": provider.id, "name": provider.business_name},
        date_from=date_from,
        date_to=date_to,
        status_filter=status_filter,
        payments=payments,
        total_amount=total_amount,
        count=len(payments),
    )


@router.get("/supplier_payments/pdf")
def supplier_payments_report_pdf(
    current_user: CurrentUser,
    session: SessionDep,
    provider_id: int = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    status_filter: Literal["paid", "pending", "all"] = Query("all"),
):
    """
    PDF del reporte de pagos a proveedor.
    Mismos filtros y roles que GET /supplier_payments.
    """
    _check_report_role(current_user)

    provider, payments, total_amount = _build_supplier_payments_data(
        session, provider_id, date_from, date_to, status_filter,
    )

    status_label = STATUS_FILTER_LABELS.get(status_filter, status_filter)
    config = session.exec(select(GlobalConfig)).first()

    payments_payload = [
        {
            "payment_date": row.payment_date,
            "invoice_number": row.invoice_number,
            "amount": row.amount,
            "payment_method": row.payment_method,
            "reference": row.reference,
            "status": row.status,
        }
        for row in payments
    ]

    generator = PDFGenerator()
    pdf_buffer = generator.generate_supplier_payments_report(
        provider_name=provider.business_name,
        date_from=date_from,
        date_to=date_to,
        status_label=status_label,
        payments=payments_payload,
        total_amount=total_amount,
        config=config,
    )

    filename = f"reporte_pagos_{provider_id}.pdf"
    pdf_buffer.seek(0)
    return StreamingResponse(
        iter([pdf_buffer.read()]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )
