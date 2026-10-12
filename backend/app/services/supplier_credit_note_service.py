"""Supplier credit notes: lower the invoice balance; a return takes the material out of stock at the invoice cost,
and a price adjustment on a one-line invoice corrects the material cost when it still matches that invoice."""
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlmodel import Session

from app.core.permissions import FINANCE_ROLES, require_roles
from app.models.finance import (CreditNote, CreditNoteItem, CreditNoteStatus, CreditNoteType, InvoiceStatus,
                                PurchaseInvoice)
from app.models.material import Material, holds_stock, to_usage_units
from app.repositories import supplier_payment_repository as repo
from app.schemas.finance_schema import CreditNoteCreate, CreditNoteRead
from app.services import inventory_service

ReturnLine = Tuple[Material, float, float]  # material, quantity in purchase units, unit cost of the invoice


def _return_line(session: Session, invoice: PurchaseInvoice, line) -> ReturnLine:
    if line.returned_quantity <= 0:
        raise HTTPException(status_code=400, detail="La cantidad a devolver debe ser mayor a cero.")
    item = repo.get_invoice_item(session, invoice.accounts_payable_id, line.material_id)
    if not item:
        raise HTTPException(status_code=400,
                            detail=f"El material {line.material_id} no está en esta factura, no se puede devolver.")
    if line.returned_quantity > float(item.quantity_received or 0):
        raise HTTPException(status_code=400, detail=f"No puedes devolver {line.returned_quantity} del material "
                            f"{line.material_id}: la factura solo trajo {item.quantity_received}.")
    material = session.get(Material, line.material_id)
    if not material:
        raise HTTPException(status_code=404, detail=f"Material {line.material_id} no encontrado.")
    if holds_stock(material) and to_usage_units(material, line.returned_quantity) > float(material.physical_stock or 0):
        raise HTTPException(status_code=400, detail=f"No puedes devolver {line.returned_quantity} de '{material.name}': "
                            f"stock actual es {material.physical_stock} {material.usage_unit or ''}.")
    return material, line.returned_quantity, float(item.unit_cost or 0)


def _price_return(session: Session, invoice: PurchaseInvoice, data: CreditNoteCreate) -> List[ReturnLine]:
    """A return is priced from its lines at the invoice cost; the captured total is replaced."""
    if not data.items:
        raise HTTPException(status_code=400,
                            detail="Una devolución requiere al menos una línea (material y cantidad).")
    lines = [_return_line(session, invoice, line) for line in data.items]
    subtotal = round(sum(qty * cost for _, qty, cost in lines), 2)
    data.total_amount = round(subtotal + round(subtotal * float(data.tax_rate or 0.16), 2), 2)
    return lines


def _apply_return(session: Session, note: CreditNote, lines: List[ReturnLine], reason: Optional[str]) -> list:
    detail = []
    for material, qty, unit_cost in lines:
        if not holds_stock(material):
            continue  # only the MATERIAL route ever entered stock
        inventory_service.register_movement(session, material.id, "RETURN", to_usage_units(material, qty),
                                            unit_cost=unit_cost, reason=reason, commit=False)
        session.add(CreditNoteItem(credit_note_id=note.id, material_id=material.id, returned_quantity=qty,
                                   unit_cost=unit_cost))
        detail.append({"material_id": material.id, "material_name": material.name, "returned_quantity": qty,
                       "unit_cost": unit_cost, "line_total": round(qty * unit_cost, 2)})
    return detail


def _adjust_cost(session: Session, invoice: PurchaseInvoice, note: CreditNote) -> Optional[str]:
    items = repo.get_invoice_items(session, invoice.accounts_payable_id)
    if len(items) > 1:
        return f"Costo NO ajustado: la factura tiene {len(items)} partidas. Ajusta manualmente."
    if not items:
        return None
    material = session.get(Material, items[0].material_id) if items[0].material_id else None
    qty = float(items[0].quantity_received or 0)
    if not material or qty <= 0:
        return "Costo NO ajustado: partida sin material o sin cantidad."
    current = round(float(material.current_cost or 0), 2)
    invoiced = round(float(items[0].unit_cost or 0), 2)
    if invoiced != current:
        return (f"Costo NO ajustado: el costo vigente (${current:,.2f}) no corresponde a esta factura "
                f"(${invoiced:,.2f}). Ajusta manualmente.")
    note.previous_material_cost = material.current_cost
    material.current_cost = round(float(material.current_cost) - note.subtotal / qty, 2)
    session.add(material)
    return f"Costo del material ajustado de ${invoiced:,.2f} a ${material.current_cost:,.2f}"


def _new_note(invoice: PurchaseInvoice, data: CreditNoteCreate, user) -> CreditNote:
    rate = float(data.tax_rate or 0.16)
    subtotal = round(data.total_amount / (1 + rate), 2)
    return CreditNote(
        purchase_invoice_id=invoice.id, accounts_payable_id=invoice.accounts_payable_id,
        provider_id=invoice.provider_id, folio=data.folio, credit_type=data.credit_type, subtotal=subtotal,
        tax_rate=rate, tax_amount=round(data.total_amount - subtotal, 2), total_amount=round(data.total_amount, 2),
        reason=data.reason, status=CreditNoteStatus.ACTIVE, created_by=user.id)


def create_credit_note(session: Session, data: CreditNoteCreate, user) -> CreditNoteRead:
    require_roles(user, FINANCE_ROLES, "No tienes permiso para registrar Notas de Credito.")
    invoice = session.get(PurchaseInvoice, data.purchase_invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada.")
    lines = _price_return(session, invoice, data) if data.credit_type == CreditNoteType.RETURN else []
    if (data.total_amount or 0) <= 0:
        raise HTTPException(status_code=400, detail="El monto de la NC debe ser mayor a cero.")
    balance = float(invoice.outstanding_balance or 0)
    if round(data.total_amount, 2) > round(balance, 2):
        raise HTTPException(status_code=400, detail=f"La NC (${data.total_amount:,.2f}) no puede exceder el saldo "
                                                    f"pendiente (${balance:,.2f}).")
    note = _new_note(invoice, data, user)
    session.add(note)
    invoice.outstanding_balance = round(balance - data.total_amount, 2)
    if invoice.outstanding_balance <= 0.01:
        invoice.status = InvoiceStatus.PAID
    session.flush()
    returned = _apply_return(session, note, lines, data.reason)
    message = _adjust_cost(session, invoice, note) if data.credit_type == CreditNoteType.PRICE_ADJUSTMENT else None
    session.add(invoice)
    session.commit()
    session.refresh(note)
    result = CreditNoteRead.model_validate(note, from_attributes=True)
    result.new_outstanding_balance = invoice.outstanding_balance
    result.cost_adjustment_message = message
    result.returned_items = returned
    return result
