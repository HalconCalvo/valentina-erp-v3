#!/usr/bin/env python3
"""
Recalcula el estimated_cost (y material_cost) de TODAS las versiones de receta,
usando la MISMA formula que el editor (design.py):
    por cada componente de material ACTIVO:
        factor = conversion_factor (o 1 si es 0/nulo)
        unit_cost = current_cost / factor
        cost_line = ceil(quantity * unit_cost * 100) / 100
        estimated_cost += cost_line
        si production_route == MATERIAL: material_cost += cost_line
Materiales inactivos se excluyen (ya fueron dados de baja).

Uso:
  python3 recalcular_costos_recetas.py            # DRY-RUN (no toca nada)
  python3 recalcular_costos_recetas.py --apply    # aplica y commitea
"""
import os
import sys
import math
import psycopg2
from datetime import datetime

DRY_RUN = "--apply" not in sys.argv
UMBRAL = 1.0  # solo reporta/actualiza si difiere mas de $1

PGURL = os.environ.get("PGURL")
if not PGURL:
    print("ERROR: falta PGURL. Corre:  source ~/.pgurl_valentina")
    sys.exit(1)

conn = psycopg2.connect(PGURL)
conn.autocommit = False
cur = conn.cursor()

print("=" * 70)
print(f"RECALCULO DE COSTOS DE RECETAS  —  modo: {'DRY-RUN' if DRY_RUN else 'APPLY'}")
print("=" * 70)

# Todas las versiones con componentes
cur.execute("SELECT DISTINCT version_id FROM design_version_components ORDER BY version_id")
versiones = [r[0] for r in cur.fetchall()]
print(f"\nVersiones a revisar: {len(versiones)}")

# Backup de estimated_cost/material_cost actuales (solo apply)
if not DRY_RUN:
    cur.execute("SELECT id, estimated_cost, material_cost FROM design_product_versions WHERE id = ANY(%s)", (versiones,))
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bpath = os.path.expanduser(f"~/backup_costos_recetas_{ts}.txt")
    with open(bpath, "w") as f:
        f.write("version_id\testimated_cost\tmaterial_cost\n")
        for vid, ec, mc in cur.fetchall():
            f.write(f"{vid}\t{ec}\t{mc}\n")
    print(f"Backup: {bpath}")

cambios = []
for vid in versiones:
    cur.execute("""
        SELECT dvc.quantity, m.current_cost, m.conversion_factor, m.production_route, m.is_active
        FROM design_version_components dvc
        JOIN materials m ON m.id = dvc.material_id
        WHERE dvc.version_id = %s
    """, (vid,))
    est = 0.0
    matc = 0.0
    for qty, cost, factor, route, is_active in cur.fetchall():
        if not is_active:
            continue
        f = factor if (factor and factor > 0) else 1.0
        unit = (cost or 0) / f
        line = math.ceil(qty * unit * 100) / 100
        est += line
        if route == "MATERIAL":
            matc += line
    est = round(est, 2)
    matc = round(matc, 2)

    cur.execute("SELECT estimated_cost, material_cost FROM design_product_versions WHERE id = %s", (vid,))
    ec_old, mc_old = cur.fetchone()
    if abs(est - float(ec_old)) > UMBRAL:
        cambios.append((vid, float(ec_old), est, mc_old, matc))
        if not DRY_RUN:
            cur.execute("UPDATE design_product_versions SET estimated_cost=%s, material_cost=%s WHERE id=%s",
                        (est, matc, vid))

print(f"\nVersiones con cambio (> ${UMBRAL:.0f}): {len(cambios)}")
print(f"{'version':>8} | {'antes':>12} | {'despues':>12} | {'dif':>10}")
print("-" * 50)
for vid, ec_old, est, mc_old, matc in cambios:
    print(f"{vid:>8} | {ec_old:>12.2f} | {est:>12.2f} | {est-ec_old:>+10.2f}")

if DRY_RUN:
    conn.rollback()
    print("\n" + "=" * 70)
    print("DRY-RUN: no se toco la base. Para aplicar:  python3 recalcular_costos_recetas.py --apply")
    print("=" * 70)
else:
    conn.commit()
    print("\n" + "=" * 70)
    print(f"APLICADO: {len(cambios)} versiones actualizadas y commiteadas.")
    print("=" * 70)

cur.close()
conn.close()