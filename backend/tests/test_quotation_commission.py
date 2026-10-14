"""H1: the quotation keeps the commission its prices were made with: an explicit 0 stays 0; without one, the
seller's commission."""
from sqlmodel import select

from app.models.users import User
from tests.sales_helpers import QUOTATIONS, quotation_payload
from tests.conftest import TEST_DIRECTOR_EMAIL


def test_explicit_zero_commission_is_kept_and_missing_takes_the_sellers(client_fixture, session_fixture,
                                                                       auth_header_director, seed_client_and_tax):
    director = session_fixture.exec(select(User).where(User.email == TEST_DIRECTOR_EMAIL)).one()
    director.commission_rate = 5.0
    session_fixture.add(director)
    session_fixture.commit()
    base = quotation_payload(seed_client_and_tax[0].id, seed_client_and_tax[1].id)
    zero = client_fixture.post(f"{QUOTATIONS}/", headers=auth_header_director,
                               json={**base, "applied_commission_percent": 0}).json()
    missing = client_fixture.post(f"{QUOTATIONS}/", headers=auth_header_director, json=base).json()
    assert zero["applied_commission_percent"] == 0
    assert missing["applied_commission_percent"] == 0.05
