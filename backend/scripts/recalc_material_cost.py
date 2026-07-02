import math
from sqlmodel import Session, select
from app.core.database import engine
from app.models.design import ProductVersion, VersionComponent
from app.models.material import Material, ProductionRoute


def recalc():
    updated = 0
    with Session(engine) as session:
        versions = session.exec(select(ProductVersion)).all()
        for v in versions:
            comps = session.exec(
                select(VersionComponent).where(VersionComponent.version_id == v.id)
            ).all()
            total_material = 0.0
            for c in comps:
                mat = session.get(Material, c.material_id)
                if not mat:
                    continue
                factor = mat.conversion_factor if mat.conversion_factor and mat.conversion_factor > 0 else 1.0
                unit_cost = mat.current_cost / factor
                line = math.ceil((c.quantity * unit_cost) * 100) / 100
                if mat.production_route == ProductionRoute.MATERIAL:
                    total_material += line
            nuevo = round(total_material, 2)
            if abs((v.material_cost or 0) - nuevo) > 0.001:
                v.material_cost = nuevo
                session.add(v)
                updated += 1
        session.commit()
    print(f"Versiones actualizadas: {updated} de {len(versions)}")


if __name__ == "__main__":
    recalc()
