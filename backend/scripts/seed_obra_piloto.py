"""Obra piloto for "Valentina Pruebas" (Gabriel, 2026-10-12; docs/OBRA_PILOTO.md).

Creates, only in the Pruebas database, the client "OBRA PILOTO" and its recipe "Cocina Obra Piloto" (furniture and
stone, with INSTALACOCINA and INSTALAGRANITO lines), copied from a real recipe in READY status. From there each area
does its part on screen: Sales quotes 3 houses and generates the OV, Design baptizes and batches, and so on.

Usage (from backend/):  python3 -m scripts.seed_obra_piloto [--source-version ID]
The connection comes from ~/.pgurl_valentina_pruebas; it refuses the production database (~/.pgurl_valentina).
Running it twice changes nothing.
"""
import argparse
import os
import sys
from pathlib import Path
from typing import List, Optional, Tuple

from sqlmodel import Session, create_engine, select

from app.models.design import ProductMaster, ProductVersion, VersionComponent, VersionStatus
from app.models.foundations import Client
from app.models.material import Material
from app.services.design_version_service import refresh_version_cache

CLIENT_NAME = "OBRA PILOTO"
PRODUCT_NAME = "Cocina Obra Piloto"
INSTALL_SKUS = {"INSTALACOCINA", "INSTALAGRANITO"}


def _components(session: Session, version_id: int) -> List[Tuple[int, float, str]]:
    rows = session.exec(select(VersionComponent.material_id, VersionComponent.quantity, Material.sku)
                        .join(Material, Material.id == VersionComponent.material_id)
                        .where(VersionComponent.version_id == version_id)).all()
    return [(mid, float(qty), sku) for mid, qty, sku in rows]


def pick_source_version(session: Session) -> Optional[ProductVersion]:
    """A ready recipe with furniture, stone and both installation lines (the most complete kitchen)."""
    candidates = session.exec(select(ProductVersion).where(
        ProductVersion.status == VersionStatus.READY, ProductVersion.is_active == True,  # noqa: E712
        ProductVersion.has_mdf_components == True, ProductVersion.has_stone_components == True)  # noqa: E712
        .order_by(ProductVersion.id.desc())).all()
    for version in candidates:
        if INSTALL_SKUS <= {sku for _, _, sku in _components(session, version.id)}:
            return version
    return None


def _client(session: Session) -> Client:
    client = session.exec(select(Client).where(Client.full_name == CLIENT_NAME)).first()
    if client:
        return client
    client = Client(full_name=CLIENT_NAME, email="obra.piloto@pruebas.local", phone="0000000000",
                    fiscal_address="Obra de capacitación (ambiente de pruebas)", contact_name="Capacitación")
    session.add(client)
    session.flush()
    return client


def create_pilot(session: Session, source_version_id: Optional[int] = None) -> dict:
    """Client and recipe of the pilot project; idempotent."""
    source = session.get(ProductVersion, source_version_id) if source_version_id else pick_source_version(session)
    if not source:
        raise ValueError("No hay receta lista con muebles, piedra e instalaciones para copiar.")
    client = _client(session)
    master = session.exec(select(ProductMaster).where(ProductMaster.name == PRODUCT_NAME,
                                                      ProductMaster.client_id == client.id)).first()
    if master:
        session.commit()
        return {"client_id": client.id, "master_id": master.id, "created": False}
    master = ProductMaster(name=PRODUCT_NAME, category="Cocinas", client_id=client.id, project_name=CLIENT_NAME)
    session.add(master)
    session.flush()
    version = ProductVersion(master_id=master.id, version_name="V1.0", status=VersionStatus.READY, is_active=True,
                             commercial_description="Cocina con muebles y cubierta de granito (obra piloto)")
    session.add(version)
    session.flush()
    components = [(mid, qty) for mid, qty, _ in _components(session, source.id)]
    for material_id, quantity in components:
        session.add(VersionComponent(version_id=version.id, material_id=material_id, quantity=quantity))
    refresh_version_cache(session, version, components)
    session.commit()
    return {"client_id": client.id, "master_id": master.id, "version_id": version.id, "source_version_id": source.id,
            "created": True}


def _pruebas_url() -> str:
    test_url = (Path.home() / ".pgurl_valentina_pruebas").read_text().strip()
    prod_file = Path.home() / ".pgurl_valentina"
    prod_url = prod_file.read_text().strip() if prod_file.exists() else ""
    database = test_url.split("?")[0].rsplit("/", 1)[-1]
    if not test_url or test_url == prod_url or "pruebas" not in database:
        sys.exit("ABORTADO: ~/.pgurl_valentina_pruebas no es la base de Pruebas.")
    return test_url


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-version", type=int, default=None)
    args = parser.parse_args()
    os.environ["LOCAL_SAFE_MODE"] = "true"
    with Session(create_engine(_pruebas_url())) as db:
        print(create_pilot(db, args.source_version))
