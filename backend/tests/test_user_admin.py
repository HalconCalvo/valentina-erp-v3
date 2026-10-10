"""Only DIRECTOR/ADMIN administer users; anyone edits only their own name, phone and password; users are
deactivated with a reason, never deleted."""
from sqlmodel import select

from app.core.config import settings
from app.models.audit import AuditFieldChange
from app.models.users import User

USERS = f"{settings.API_V1_STR}/users"
NEW_USER = {"email": "nuevo@test.local", "full_name": "Nuevo", "role": "DIRECTOR", "password": "Secreta123!"}


def _sales(session):
    return session.exec(select(User).where(User.role == "SALES")).one()


def test_sales_cannot_create_users_or_escalate(client_fixture, session_fixture, sales_token):
    headers = {"Authorization": f"Bearer {sales_token}"}
    assert client_fixture.post(f"{USERS}/", headers=headers, json=NEW_USER).status_code == 403
    me = _sales(session_fixture)
    assert client_fixture.put(f"{USERS}/{me.id}", headers=headers, json={"role": "DIRECTOR"}).status_code == 403
    director = session_fixture.exec(select(User).where(User.role == "DIRECTOR")).first()
    assert client_fixture.put(f"{USERS}/{director.id}", headers=headers, json={"full_name": "x"}).status_code == 403
    session_fixture.refresh(me)
    assert str(getattr(me.role, "value", me.role)) == "SALES"


def test_anyone_edits_own_name_and_password(client_fixture, session_fixture, sales_token):
    me = _sales(session_fixture)
    response = client_fixture.put(f"{USERS}/{me.id}", headers={"Authorization": f"Bearer {sales_token}"},
                                  json={"full_name": "Vendedor Renombrado", "password": "OtraClave123!"})
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "Vendedor Renombrado"


def test_director_creates_and_deactivates_with_reason(client_fixture, session_fixture, auth_header_director):
    created = client_fixture.post(f"{USERS}/", headers=auth_header_director, json={**NEW_USER, "role": "SALES"})
    assert created.status_code == 200, created.text
    user_id = created.json()["id"]
    assert client_fixture.patch(f"{USERS}/{user_id}/deactivate", headers=auth_header_director,
                                json={"reason": "  "}).status_code == 422
    response = client_fixture.patch(f"{USERS}/{user_id}/deactivate", headers=auth_header_director,
                                    json={"reason": "Ya no labora en la empresa"})
    assert response.status_code == 200, response.text
    assert response.json()["is_active"] is False
    session_fixture.expire_all()
    assert session_fixture.get(User, user_id) is not None  # never deleted
    change = session_fixture.exec(select(AuditFieldChange).where(
        AuditFieldChange.table_name == "users", AuditFieldChange.record_id == str(user_id),
        AuditFieldChange.field_name == "is_active")).one()
    assert change.reason == "Ya no labora en la empresa"
    assert client_fixture.delete(f"{USERS}/{user_id}", headers=auth_header_director).status_code == 405


def test_sales_cannot_deactivate(client_fixture, session_fixture, sales_token):
    director = session_fixture.exec(select(User).where(User.role == "DIRECTOR")).first()
    response = client_fixture.patch(f"{USERS}/{director.id}/deactivate", headers={"Authorization": f"Bearer {sales_token}"},
                                    json={"reason": "x"})
    assert response.status_code == 403
