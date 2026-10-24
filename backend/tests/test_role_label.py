"""Gabriel 23/10: people see the role name in Spanish ("Dirección"), never "UserRole.DIRECTOR"."""
from types import SimpleNamespace

from app.models.inventory import PurchaseOrder
from app.models.users import UserRole, role_label
from app.services import purchase_service


def test_role_label_spanish_names():
    assert role_label(UserRole.DIRECTOR) == "Dirección"
    assert role_label(UserRole.MANAGER) == "Gerencia"
    assert role_label("logistics") == "Logística e instalación"
    assert role_label(None) == ""


def test_po_authorizer_shows_role_name(monkeypatch):
    user = SimpleNamespace(full_name="Ing. Gabriel Frías", email="g@x", role=UserRole.DIRECTOR)
    monkeypatch.setattr(purchase_service, "resolve_po_authorizer_user", lambda db, po: user)
    po = PurchaseOrder(authorized_by="g@x")
    assert purchase_service.resolve_po_authorizer_display(None, po) == "Ing. Gabriel Frías — Dirección"
