#!/usr/bin/env python3
"""
Refresca el frozen_unit_cost de las partidas de cotizaciones en estado DRAFT,
poniendolo igual al estimated_cost ACTUAL de la receta que referencian
(origin_version_id).

NO toca: unit_price, subtotal, total_price (el precio de venta se respeta;
el subtotal/total salen del precio, no del costo).
Solo actualiza el costo congelado, para que el margen calculado sea real.

Solo cotizaciones DRAFT (borradores). No toca cotizaciones ya cerradas.

Uso:
  python3 refrescar_costo_cotizaciones.py            # DRY-RUN
  python3 refrescar_costo_cotizaciones.py --apply    # aplica y commitea
"""
import os
import sys
import psycopg2
from datetime import datetime

DRY_RUN = "--apply" not in sys.argv
UMBRAL = 1.0

PGURL = os.environ.get("PGURL")
if not PGURL:
    print("ERROR: falta PGURL. Corre:  source ~/.pgurl_valentina")
    sys.exit(1)

conn = psycopg2.connect(PGURL)
conn.autocommit = False
cur = conn.cursor()

print("=" * 70)
print(f"REFRESCO DE COSTO EN COTIZACIONES DRAFT  —  modo: {'DRY-RUN' if DRY_RUN else 'APPLY'}")
print("=" * 70)

# Partidas DRAFT con costo congelado != costo actual de la receta
cur.execute("""
    SELECT soi.id, soi.sales_order_id, so.project_name, soi.product_name,
           soi.frozen_unit_cost, dpv.estimated_cost
    FROM sales_order_items soi
    JOIN sales_orders so ON so.id = soi.sales_order_id
    JOIN design_product_versions dpv ON dpv.id = soi.origin_version_id
    WHERE so.status = 'DRAFT'
      AND ABS(soi.frozen_unit_cost - dpv.estimated_cost) > %s
    ORDER BY soi.sales_order_id, soi.id
""", (UMBRAL,))
rows = cur.fetchall()
print(f"\nPartidas a refrescar: {len(rows)}")
cotiz = sorted(set(r[1] for r in rows))
print(f"Cotizaciones DRAFT afectadas: {len(cotiz)}  {cotiz}")

# Backup (solo apply)
if not DRY_RUN and rows:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bpath = os.path.expanduser(f"~/backup_cotiz_frozen_cost_{ts}.txt")
    with open(bpath, "w") as f:
        f.write("partida_id\tcotiz_id\tproduct_name\tfrozen_cost_viejo\tcosto_nuevo\n")
        for pid, soid, proj, pname, viejo, nuevo in rows:
            f.write(f"{pid}\t{soid}\t{pname}\t{viejo}\t{nuevo}\n")
    print(f"Backup: {bpath}")

print(f"\n{'partida':>8} {'cotiz':>6}  {'producto':<40} {'viejo':>12} {'nuevo':>12} {'dif':>10}")
print("-" * 95)
for pid, soid, proj, pname, viejo, nuevo in rows:
    pn = (pname or "")[:40]
    print(f"{pid:>8} {soid:>6}  {pn:<40} {float(viejo):>12.2f} {float(nuevo):>12.2f} {float(nuevo)-float(viejo):>+10.2f}")
    if not DRY_RUN:
        cur.execute("UPDATE sales_order_items SET frozen_unit_cost=%s WHERE id=%s", (round(float(nuevo),2), pid))

if DRY_RUN:
    conn.rollback()
    print("\n" + "=" * 70)
    print("DRY-RUN: no se toco la base. NO se cambiaron precios ni totales, solo el costo.")
    print("Para aplicar:  python3 refrescar_costo_cotizaciones.py --apply")
    print("=" * 70)
else:
    conn.commit()
    print("\n" + "=" * 70)
    print(f"APLICADO: {len(rows)} partidas de {len(cotiz)} cotizaciones DRAFT actualizadas.")
    print("Precios de venta y totales NO se modificaron.")
    print("=" * 70)

cur.close()
conn.close()