"""D44 (Gabriel 17/10): the global commission goes to ONE beneficiary set in GlobalConfig (any active user) at its
percent of every collection without IVA; it shows in the commission trays and only DIRECTOR changes the setting."""
from sqlmodel import select

from app.core.config import settings
from app.models.foundations import GlobalConfig
from app.models.sales import (CommissionType, CustomerPayment, CXCStatus, PaymentType, SalesCommission, SalesOrder)
from app.models.users import User, UserRole
from app.services import sales_service
from tests.sales_helpers import create_order_via_quotation
from tests.test_installation_flow import _user

API = settings.API_V1_STR


def _config(session) -> GlobalConfig:
    config = session.exec(select(GlobalConfig)).first()
    if not config:
        config = GlobalConfig(company_name="K", target_profit_margin=0.45, cost_tolerance_percent=5,
                              quote_validity_days=15, default_edgebanding_factor=1.1)
        session.add(config)
        session.commit()
    return config


def _collect(client, session, headers, seed) -> CustomerPayment:
    order = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)
    cxc = CustomerPayment(sales_order_id=order["id"], payment_type=PaymentType.ADVANCE, amount=11600.0,
                          status=CXCStatus.PAID, invoice_folio="A-1", created_by_user_id=1)
    session.add(cxc)
    session.commit()
    sales_service._add_cxc_commissions(session, session.get(SalesOrder, order["id"]), cxc.id, 11600.0, is_advance=True)
    session.commit()
    return cxc


def _globals(session, cxc_id):
    return session.exec(select(SalesCommission).where(SalesCommission.customer_payment_id == cxc_id,
                                                      SalesCommission.commission_type == CommissionType.DIRECTOR_GLOBAL)).all()


def test_one_global_commission_for_the_configured_beneficiary(client_fixture, session_fixture, auth_header_director,
                                                              seed_client_and_tax):
    beneficiary, _ = _user(session_fixture, UserRole.MANAGER, "Gerente General")
    for director in session_fixture.exec(select(User).where(User.role == UserRole.DIRECTOR)).all():
        director.global_commission_rate = 2.0  # the old per-director rate is no longer read
    config = _config(session_fixture)
    config.global_commission_user_id, config.global_commission_percent = beneficiary.id, 2.0
    session_fixture.commit()
    cxc = _collect(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    rows = _globals(session_fixture, cxc.id)
    assert [(r.user_id, r.rate, round(r.commission_amount, 2)) for r in rows] == [(beneficiary.id, 0.02, 200.0)]

    overview = client_fixture.get(f"{API}/sales/commissions/payroll-overview", headers=auth_header_director).json()
    payable = [r for r in overview["payable"] if r["commission_type"] == "DIRECTOR_GLOBAL"]
    assert [(r["seller_id"], r["amount"]) for r in payable] == [(beneficiary.id, 200.0)]


def test_no_beneficiary_or_zero_percent_generates_none(client_fixture, session_fixture, auth_header_director,
                                                       seed_client_and_tax):
    config = _config(session_fixture)
    config.global_commission_user_id, config.global_commission_percent = None, 2.0
    session_fixture.commit()
    cxc = _collect(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    assert _globals(session_fixture, cxc.id) == []


def test_only_director_sets_an_active_beneficiary_and_a_valid_percent(client_fixture, session_fixture,
                                                                      auth_header_director):
    config = _config(session_fixture)
    beneficiary, _ = _user(session_fixture, UserRole.SALES, "Beneficiario")
    retired, _ = _user(session_fixture, UserRole.SALES, "Baja")
    retired.is_active = False
    session_fixture.commit()
    _, manager = _user(session_fixture, UserRole.MANAGER, "Karina")
    body = {"company_name": config.company_name, "target_profit_margin": config.target_profit_margin,
            "cost_tolerance_percent": config.cost_tolerance_percent, "quote_validity_days": config.quote_validity_days,
            "default_edgebanding_factor": config.default_edgebanding_factor}
    url = f"{API}/foundations/config"
    ok = {**body, "global_commission_user_id": beneficiary.id, "global_commission_percent": 2.5}
    assert client_fixture.put(url, headers=manager, json=ok).status_code == 403
    assert client_fixture.put(url, headers=auth_header_director,
                              json={**ok, "global_commission_user_id": retired.id}).status_code == 400
    assert client_fixture.put(url, headers=auth_header_director,
                              json={**ok, "global_commission_percent": 101}).status_code == 400
    saved = client_fixture.put(url, headers=auth_header_director, json=ok)
    assert saved.status_code == 200, saved.text
    assert (saved.json()["global_commission_user_id"], saved.json()["global_commission_percent"]) == (beneficiary.id, 2.5)


def test_an_omitted_commission_is_in_no_tray(client_fixture, session_fixture, auth_header_director,
                                             seed_client_and_tax):
    """D44: the duplicated global commissions are Omitida (payroll_deferred + reason) and leave every tray."""
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    cxc = CustomerPayment(sales_order_id=order["id"], payment_type=PaymentType.PROGRESS, amount=11600.0,
                          status=CXCStatus.PAID, invoice_folio="F-1", created_by_user_id=1)
    session_fixture.add(cxc)
    session_fixture.commit()
    omitted = SalesCommission(customer_payment_id=cxc.id, user_id=1, commission_type=CommissionType.DIRECTOR_GLOBAL,
                              base_amount=10000.0, rate=0.02, commission_amount=200.0, is_advance=False,
                              is_released=False, payroll_deferred=True,
                              admin_notes="Cálculo anterior duplicado (antes de D44)")
    session_fixture.add(omitted)
    session_fixture.commit()
    overview = client_fixture.get(f"{API}/sales/commissions/payroll-overview", headers=auth_header_director).json()
    ids = [r["id"] for tray in ("retained", "payable", "paid") for r in overview[tray]]
    assert omitted.id not in ids
