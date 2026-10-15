"""H43: Field's Herrajes tab uses the same criterion as the hardware dispatch in Production: stock materials
that are neither the main material (board, stone) nor factory consumables."""
from app.models.design import VersionComponent
from app.models.material import Material, ProductionRoute
from app.services.field_service import _components_for_version


def test_hinges_and_screws_are_hardware_not_packing(session_fixture):
    version_id = 4343
    lines = [("BISAGRA", "Herrajes", ProductionRoute.MATERIAL), ("TORNILLO", "HERRAJES", ProductionRoute.MATERIAL),
             ("MDF", "Tablero", ProductionRoute.MATERIAL), ("GRANITO", "Piedra", ProductionRoute.MATERIAL),
             ("CANTO", "Chapacinta", ProductionRoute.MATERIAL), ("ARMADO", "Proceso", ProductionRoute.PROCESO)]
    for sku, category, route in lines:
        material = Material(sku=f"H43-{sku}", name=sku, category=category, production_route=route,
                            purchase_unit="PZA", usage_unit="PZA", current_cost=1.0)
        session_fixture.add(material)
        session_fixture.commit()
        session_fixture.add(VersionComponent(version_id=version_id, material_id=material.id, quantity=2))
    session_fixture.commit()
    group = _components_for_version(session_fixture, version_id)
    assert sorted(line.name for line in group.herrajes) == ["BISAGRA", "TORNILLO"]
    assert sorted(line.name for line in group.empaque) == ["ARMADO", "CANTO", "GRANITO", "MDF"]
