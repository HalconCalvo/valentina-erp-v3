"""D36: a progress invoice bills whole houses with IVA and amortizes the proportional advance collected; the last
house amortizes what is left, so advance + progress invoices − amortizations = contract total. D35-A: the pending
progress rows are shown with IVA."""
from sqlmodel import select

from app.core.config import settings
from app.models.sales import CustomerPayment, CXCStatus, PaymentType, SalesOrder, SalesOrderItemInstance
from tests.sales_helpers import create_order_via_quotation, default_items

API = f"{settings.API_V1_STR}/sales/orders"


def _order_with_paid_advance(client, session, headers, seed) -> tuple[SalesOrder, list[int]]:
    items = default_items(15871.56)
    items[0]["quantity"] = 3
    data = create_order_via_quotation(client, headers, seed[0].id, seed[1].id, items)
    order = session.get(SalesOrder, data["id"])
    advance = round(order.total_price * float(order.advance_percent) / 100.0, 2)
    session.add(CustomerPayment(sales_order_id=order.id, payment_type=PaymentType.ADVANCE, amount=advance,
                                status=CXCStatus.PAID, invoice_folio="A-1", created_by_user_id=order.user_id))
    session.commit()
    houses = session.exec(select(SalesOrderItemInstance.id)
                          .where(SalesOrderItemInstance.sales_order_item_id == order.items[0].id)).all()
    return order, sorted(houses)


def _preview(client, headers, order_id, ids):
    res = client.get(f"{API}/{order_id}/progress_preview", headers=headers, params={"instance_ids": ids})
    assert res.status_code == 200, res.text
    return res.json()


def _register(client, headers, order_id, ids, **extra):
    return client.post(f"{API}/{order_id}/register_progress", headers=headers,
                       json={"invoice_folio": f"F-{ids[0]}", "instance_ids": ids, **extra})


def test_piloto_1_figures(client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    order, houses = _order_with_paid_advance(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    factor = order.total_price / order.subtotal
    preview = _preview(client_fixture, auth_header_director, order.id, houses[:1])
    assert preview["amount"] == round(15871.56 * factor, 2)
    assert preview["amortized_advance"] == round(preview["amount"] * 0.6, 2)
    assert preview["to_collect"] == round(preview["amount"] - preview["amortized_advance"], 2)
    assert preview["is_last"] is False


def test_the_order_closes_without_spare_cents(client_fixture, session_fixture, auth_header_director,
                                              seed_client_and_tax):
    order, houses = _order_with_paid_advance(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    assert _register(client_fixture, auth_header_director, order.id, houses[:1]).status_code == 200
    last = _preview(client_fixture, auth_header_director, order.id, houses[1:])
    assert last["is_last"] is True
    assert _register(client_fixture, auth_header_director, order.id, houses[1:]).status_code == 200
    session_fixture.expire_all()
    payments = session_fixture.exec(select(CustomerPayment).where(CustomerPayment.sales_order_id == order.id)).all()
    advance = sum(p.amount for p in payments if p.payment_type == PaymentType.ADVANCE)
    progress = [p for p in payments if p.payment_type == PaymentType.PROGRESS]
    assert round(sum(p.amortized_advance for p in progress), 2) == round(advance, 2)
    billed = advance + sum(p.amount for p in progress) - sum(p.amortized_advance for p in progress)
    assert abs(billed - order.total_price) <= 1.0


def test_editing_the_amortization_needs_a_reason_and_a_limit(client_fixture, session_fixture, auth_header_director,
                                                             seed_client_and_tax):
    order, houses = _order_with_paid_advance(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    no_reason = _register(client_fixture, auth_header_director, order.id, houses[:1], amortized_advance=100.0)
    assert no_reason.status_code == 400 and "motivo" in no_reason.json()["detail"]
    too_much = _register(client_fixture, auth_header_director, order.id, houses[:1], amortized_advance=10_000_000.0,
                         amortization_reason="x")
    assert too_much.status_code == 400
    ok = _register(client_fixture, auth_header_director, order.id, houses[:1], amortized_advance=100.0,
                   amortization_reason="Acuerdo con el cliente")
    assert ok.status_code == 200, ok.text
    session_fixture.expire_all()
    stored = session_fixture.exec(select(CustomerPayment).where(CustomerPayment.payment_type == PaymentType.PROGRESS,
                                                                CustomerPayment.sales_order_id == order.id)).one()
    assert stored.amortized_advance == 100.0 and "Acuerdo" in stored.notes


def test_pending_progress_rows_are_with_iva(client_fixture, session_fixture, auth_header_director,
                                            seed_client_and_tax):
    order, houses = _order_with_paid_advance(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    house = session_fixture.get(SalesOrderItemInstance, houses[0])
    house.production_status = "CLOSED"
    session_fixture.add(house)
    session_fixture.commit()
    rights = client_fixture.get(f"{settings.API_V1_STR}/sales/invoicing-rights", headers=auth_header_director).json()
    row = next(r for r in rights["progress_instances"] if r["instance_id"] == houses[0])
    assert row["line_amount"] == round(15871.56 * order.total_price / order.subtotal, 2)
    assert row["line_amount_net"] == 15871.56
