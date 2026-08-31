#!/usr/bin/env python3
"""
Saneamiento de recetas (design_product_versions / design_version_components).

Operaciones (en orden):
  1. Backup de componentes afectados.
  2. Consolidar componentes duplicados (mismo material 2+ veces en una receta).
  3. Negro Bruno (271) Grupo 1: eliminar donde la receta ya tiene otro MDF de color activo.
  4. Negro Bruno (271) Grupo 2: sustituir por MDF-Sustituto (833).
  5. MiniFIX (476): desdoblar en Perno (348) + Excentrico (144). Sumar si ya existen.
  6. Recalcular estimated_cost de las recetas afectadas (TODOS los componentes / conversion_factor).

Uso:
  python3 sanear_recetas.py            # DRY-RUN (no toca nada)
  python3 sanear_recetas.py --apply    # EJECUTA los cambios
"""
import os
import sys
import psycopg2
from datetime import datetime

# --- IDs clave ---
NEGRO_BRUNO = 271
MDF_SUSTITUTO = 833
MINIFIX = 476
PERNO = 348
EXCENTRICO = 144

DRY_RUN = "--apply" not in sys.argv

PGURL = os.environ.get("PGURL")
if not PGURL:
    print("ERROR: falta la variable PGURL en el entorno. Corre:  source ~/.pgurl_valentina")
    sys.exit(1)

conn = psycopg2.connect(PGURL)
conn.autocommit = False
cur = conn.cursor()

def log(msg=""):
    print(msg)

log("=" * 70)
log(f"SANEAMIENTO DE RECETAS  —  modo: {'DRY-RUN (no toca nada)' if DRY_RUN else 'APPLY (ejecuta)'}")
log("=" * 70)

# ----------------------------------------------------------------------
# PASO 1 - Identificar recetas afectadas (para backup y recálculo final)
# ----------------------------------------------------------------------
cur.execute("""
    SELECT DISTINCT version_id FROM design_version_components
    WHERE material_id IN (%s, %s)
    UNION
    SELECT version_id FROM (
        SELECT version_id, material_id, COUNT(*) c
        FROM design_version_components
        GROUP BY version_id, material_id HAVING COUNT(*) > 1
    ) d
""", (NEGRO_BRUNO, MINIFIX))
recetas_afectadas = sorted([r[0] for r in cur.fetchall()])
log(f"\nRecetas afectadas (total): {len(recetas_afectadas)}")
log(f"  {recetas_afectadas}")

# Backup de sus componentes
cur.execute("""
    SELECT dvc.id, dvc.version_id, dvc.material_id, dvc.quantity
    FROM design_version_components dvc
    WHERE dvc.version_id = ANY(%s)
    ORDER BY dvc.version_id, dvc.material_id
""", (recetas_afectadas,))
backup_rows = cur.fetchall()
if not DRY_RUN:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bpath = os.path.expanduser(f"~/backup_recetas_saneamiento_{ts}.txt")
    with open(bpath, "w") as f:
        f.write("component_id\tversion_id\tmaterial_id\tquantity\n")
        for r in backup_rows:
            f.write(f"{r[0]}\t{r[1]}\t{r[2]}\t{r[3]}\n")
    log(f"\n[PASO 1] Backup escrito: {bpath}  ({len(backup_rows)} componentes)")
else:
    log(f"\n[PASO 1] (dry-run) Se respaldarían {len(backup_rows)} componentes de las recetas afectadas.")

# ----------------------------------------------------------------------
# PASO 2 - Consolidar duplicados
# ----------------------------------------------------------------------
log("\n[PASO 2] Consolidar componentes duplicados")
cur.execute("""
    SELECT version_id, material_id, COUNT(*) veces, SUM(quantity) qty_total,
           ARRAY_AGG(id ORDER BY id) ids
    FROM design_version_components
    GROUP BY version_id, material_id
    HAVING COUNT(*) > 1
    ORDER BY version_id, material_id
""")
dups = cur.fetchall()
for version_id, material_id, veces, qty_total, ids in dups:
    keep_id = ids[0]
    drop_ids = ids[1:]
    log(f"  receta {version_id}, material {material_id}: {veces} filas -> 1 (qty {qty_total}). "
        f"conservar id {keep_id}, borrar {drop_ids}")
    if not DRY_RUN:
        cur.execute("UPDATE design_version_components SET quantity = %s WHERE id = %s",
                    (qty_total, keep_id))
        cur.execute("DELETE FROM design_version_components WHERE id = ANY(%s)", (drop_ids,))
log(f"  Total casos consolidados: {len(dups)}")

# ----------------------------------------------------------------------
# PASO 3 - Negro Bruno Grupo 1: eliminar (receta ya tiene otro MDF color activo)
# ----------------------------------------------------------------------
log("\n[PASO 3] Negro Bruno (271) Grupo 1: ELIMINAR (receta ya tiene otro MDF de color activo)")
cur.execute("""
    SELECT DISTINCT dvc_nb.version_id
    FROM design_version_components dvc_nb
    WHERE dvc_nb.material_id = %s
      AND dvc_nb.version_id IN (
        SELECT dvc.version_id FROM design_version_components dvc
        JOIN materials m ON m.id = dvc.material_id
        WHERE m.category = 'Tablero' AND m.name NOT ILIKE '%%blanco%%'
          AND m.is_active = true AND m.id <> %s
      )
    ORDER BY dvc_nb.version_id
""", (NEGRO_BRUNO, NEGRO_BRUNO))
grupo1 = [r[0] for r in cur.fetchall()]
log(f"  Grupo 1 ({len(grupo1)} recetas): {grupo1}")
if not DRY_RUN:
    cur.execute("DELETE FROM design_version_components WHERE material_id = %s AND version_id = ANY(%s)",
                (NEGRO_BRUNO, grupo1))
log(f"  Se elimina el componente Negro Bruno de esas {len(grupo1)} recetas.")

# ----------------------------------------------------------------------
# PASO 4 - Negro Bruno Grupo 2: sustituir por MDF-Sustituto (833)
# ----------------------------------------------------------------------
log("\n[PASO 4] Negro Bruno (271) Grupo 2: SUSTITUIR por MDF-Sustituto (833)")
cur.execute("""
    SELECT DISTINCT version_id FROM design_version_components
    WHERE material_id = %s ORDER BY version_id
""", (NEGRO_BRUNO,))
restantes = [r[0] for r in cur.fetchall()]  # tras paso 3, en dry-run el grupo1 sigue; filtramos
grupo2 = [v for v in restantes if v not in grupo1]
log(f"  Grupo 2 ({len(grupo2)} recetas): {grupo2}")
if not DRY_RUN:
    cur.execute("UPDATE design_version_components SET material_id = %s WHERE material_id = %s AND version_id = ANY(%s)",
                (MDF_SUSTITUTO, NEGRO_BRUNO, grupo2))
log(f"  Se cambia material 271 -> 833 en esas {len(grupo2)} recetas (misma cantidad).")

# ----------------------------------------------------------------------
# PASO 5 - MiniFIX: desdoblar en Perno + Excentrico
# ----------------------------------------------------------------------
log("\n[PASO 5] MiniFIX (476): desdoblar en Perno (348) + Excentrico (144)")
cur.execute("""
    SELECT version_id, quantity FROM design_version_components
    WHERE material_id = %s ORDER BY version_id
""", (MINIFIX,))
minifix_rows = cur.fetchall()
log(f"  MiniFIX en {len(minifix_rows)} recetas.")
for version_id, qty in minifix_rows:
    for sustituto, nombre in ((PERNO, "Perno"), (EXCENTRICO, "Excentrico")):
        # ¿ya existe ese material en la receta?
        cur.execute("SELECT id, quantity FROM design_version_components WHERE version_id=%s AND material_id=%s",
                    (version_id, sustituto))
        existe = cur.fetchone()
        if existe:
            nueva_qty = existe[1] + qty
            log(f"  receta {version_id}: {nombre} ya existe (qty {existe[1]}) -> suma {qty} = {nueva_qty}")
            if not DRY_RUN:
                cur.execute("UPDATE design_version_components SET quantity=%s WHERE id=%s",
                            (nueva_qty, existe[0]))
        else:
            log(f"  receta {version_id}: agregar {nombre} qty {qty}")
            if not DRY_RUN:
                cur.execute("INSERT INTO design_version_components (version_id, material_id, quantity) VALUES (%s,%s,%s)",
                            (version_id, sustituto, qty))
    # eliminar el MiniFIX
    if not DRY_RUN:
        cur.execute("DELETE FROM design_version_components WHERE version_id=%s AND material_id=%s",
                    (version_id, MINIFIX))
log(f"  MiniFIX desdoblado y eliminado en {len(minifix_rows)} recetas.")

# ----------------------------------------------------------------------
# PASO 6 - Recalcular estimated_cost de las recetas afectadas
# ----------------------------------------------------------------------
log("\n[PASO 6] Recalcular estimated_cost (TODOS los componentes / conversion_factor)")
for version_id in recetas_afectadas:
    cur.execute("""
        SELECT ROUND(SUM(dvc.quantity * (m.current_cost / NULLIF(m.conversion_factor,0)))::numeric, 2)
        FROM design_version_components dvc
        JOIN materials m ON m.id = dvc.material_id
        WHERE dvc.version_id = %s
    """, (version_id,))
    nuevo = cur.fetchone()[0]
    cur.execute("SELECT estimated_cost FROM design_product_versions WHERE id = %s", (version_id,))
    viejo = cur.fetchone()[0]
    marca = "" if (nuevo is None or abs(float(nuevo) - float(viejo)) < 0.01) else "  <-- CAMBIA"
    log(f"  receta {version_id}: {viejo} -> {nuevo}{marca}")
    if not DRY_RUN and nuevo is not None:
        cur.execute("UPDATE design_product_versions SET estimated_cost = %s WHERE id = %s",
                    (nuevo, version_id))

# ----------------------------------------------------------------------
# Cierre
# ----------------------------------------------------------------------
if DRY_RUN:
    log("\n" + "=" * 70)
    log("DRY-RUN terminado. NO se tocó la base de datos.")
    log("Para ejecutar de verdad:  python3 sanear_recetas.py --apply")
    log("=" * 70)
    conn.rollback()
else:
    conn.commit()
    log("\n" + "=" * 70)
    log("CAMBIOS APLICADOS Y COMMITEADOS.")
    log("=" * 70)

cur.close()
conn.close()