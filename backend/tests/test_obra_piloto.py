"""Obra piloto (Valentina Pruebas): the client and a kitchen recipe with furniture, stone and installations."""
from sqlmodel import select

from app.models.design import ProductMaster, ProductVersion, VersionComponent
from app.models.foundations import Client
from app.models.material import Material, ProductionRoute
from scripts.seed_obra_piloto import create_pilot


def _material(session, sku, category, route=ProductionRoute.MATERIAL, unit="Pz"):
    material = Material(sku=sku, name=sku, category=category, production_route=route, purchase_unit=unit,
                        usage_unit=unit, current_cost=100.0)
    session.add(material)
    session.commit()
    return material


def test_pilot_copies_a_complete_kitchen_once(session_fixture):
    lines = [(_material(session_fixture, "MDF15", "Tablero"), 4), (_material(session_fixture, "GRANITO", "Piedra"), 1),
             (_material(session_fixture, "INSTALACOCINA", "Proceso", ProductionRoute.PROCESO, "Día"), 0.5),
             (_material(session_fixture, "INSTALAGRANITO", "Proceso", ProductionRoute.PROCESO, "Día"), 1)]
    master = ProductMaster(name="Cocina real")
    session_fixture.add(master)
    session_fixture.commit()
    source = ProductVersion(master_id=master.id, version_name="V1", status="READY", has_mdf_components=True,
                            has_stone_components=True)
    session_fixture.add(source)
    session_fixture.commit()
    session_fixture.add_all([VersionComponent(version_id=source.id, material_id=m.id, quantity=q) for m, q in lines])
    session_fixture.commit()

    created = create_pilot(session_fixture)
    assert created["created"] and created["source_version_id"] == source.id
    version = session_fixture.get(ProductVersion, created["version_id"])
    assert version.status == "READY" and version.has_mdf_components and version.has_stone_components
    assert len(session_fixture.exec(select(VersionComponent).where(VersionComponent.version_id == version.id)).all()) == 4
    assert create_pilot(session_fixture)["created"] is False
    assert len(session_fixture.exec(select(Client).where(Client.full_name == "OBRA PILOTO")).all()) == 1
