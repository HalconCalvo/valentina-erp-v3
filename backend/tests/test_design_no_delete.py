"""Unused designs are deactivated, never deleted; the catalog hides them."""
from sqlmodel import select

from app.core.config import settings
from app.models.design import ProductMaster, ProductVersion
from app.models.foundations import Client

DESIGN = f"{settings.API_V1_STR}/design"


def _design(session):
    client = session.exec(select(Client)).first()
    master = ProductMaster(name="Closet sin uso", client_id=client.id)
    session.add(master)
    session.flush()
    kept = ProductVersion(master_id=master.id, version_name="V1.0", status="READY")
    draft = ProductVersion(master_id=master.id, version_name="V2.0", status="DRAFT")
    session.add_all([kept, draft])
    session.commit()
    return master, kept, draft


def test_unused_version_is_discarded_not_deleted(client_fixture, session_fixture, auth_header_director):
    master, kept, draft = _design(session_fixture)
    assert client_fixture.delete(f"{DESIGN}/versions/{draft.id}", headers=auth_header_director).status_code == 200
    session_fixture.expire_all()
    draft = session_fixture.get(ProductVersion, draft.id)
    assert draft is not None and draft.is_active is False and draft.status == "OBSOLETE"
    listed = client_fixture.get(f"{DESIGN}/masters", headers=auth_header_director).json()
    names = [v["version_name"] for m in listed if m["id"] == master.id for v in m["versions"]]
    assert names == ["V1.0"]


def test_unused_master_is_deactivated_with_its_versions(client_fixture, session_fixture, auth_header_director):
    master, kept, draft = _design(session_fixture)
    assert client_fixture.delete(f"{DESIGN}/masters/{master.id}", headers=auth_header_director).status_code == 200
    session_fixture.expire_all()
    assert session_fixture.get(ProductMaster, master.id).is_active is False
    assert all(v.is_active is False for v in session_fixture.exec(
        select(ProductVersion).where(ProductVersion.master_id == master.id)).all())
    listed = client_fixture.get(f"{DESIGN}/masters", headers=auth_header_director).json()
    assert master.id not in [m["id"] for m in listed]
