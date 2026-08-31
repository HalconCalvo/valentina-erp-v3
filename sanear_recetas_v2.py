#!/usr/bin/env python3
"""
Saneamiento de recetas v2.

DIFERENCIA CLAVE vs v1: siempre EJECUTA los cambios dentro de una transacción.
- En dry-run hace ROLLBACK al final (no persiste nada), pero como los cambios sí
  ocurrieron dentro de la transacción, el recálculo del Paso 6 refleja el estado
  REAL tras todos los pasos (incluida la eliminación del Negro Bruno).
- En --apply hace COMMIT.

Operaciones (en orden):
  1. Backup de componentes afectados (a archivo, solo en --apply).
  2. Consolidar componentes duplicados.
  3. Negro Bruno (271) Grupo 1: eliminar (receta ya tiene otro MDF de color activo).
  4. Negro Bruno (271) Grupo 2: sustituir por MDF-Sustituto (833).
  5. MiniFIX (476): desdoblar en Perno (348) + Excentrico (144); sumar si ya existen.
  6. Recalcular estimated_cost (TODOS los componentes / conversion_factor).

Uso:
  python3 sanear_recetas_v2.py            # DRY-RUN (ejecuta en transacción y hace ROLLBACK)
  python3 sanear_recetas_v2.py --apply    # EJECUTA y COMMITEA
"""
import os
import sys
import psycopg2
from datetime import datetime

NEGRO_BRUNO = 271
MDF_SUSTITUTO = 833
MINIFIX = 476
PERNO = 348
EXCENTRICO = 144

DRY_RUN = "--apply" not in sys.argv

PGURL = os.environ.get("PGURL")
if not PGURL:
    print("ERROR: falta PGURL. Corre:  source ~/.pgurl_valentina")
    sys.exit(1)

conn = psycopg2.connect(PGURL)
conn.autocommit = False
cur = conn.cursor()

def log(m=""):
    print(m)

log("=" * 70)
log(f"SANEAMIENTO DE RECETAS v2  —  modo: {'DRY-RUN (rollback al final)' if DRY_RUN else 'APPLY (commit)'}")
log("=" * 70)

# --- Recetas afectadas ---
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
recetas = sorted([r[0] for r in cur.fetchall()])
log(f"\nRecetas afectadas: {len(recetas)}")

# --- Costo ANTES (para comparar) ---
costo_antes = {}
cur.execute("SELECT id, estimated_cost FROM design_product_versions WHERE id = ANY(%s)", (recetas,))
for vid, ec in cur.fetchall():
    costo_antes[vid] = float(ec)

# --- PASO 1: Backup (solo apply) ---
cur.execute("""
    SELECT id, version_id, material_id, quantity
    FROM design_version_components WHERE version_id = ANY(%s)
    ORDER BY version_id, material_id
""", (recetas,))
backup_rows = cur.fetchall()
if not DRY_RUN:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bpath = os.path.expanduser(f"~/backup_recetas_saneamiento_{ts}.txt")
    with open(bpath, "w") as f:
        f.write("component_id\tversion_id\tmaterial_id\tquantity\n")
        for r in backup_rows:
            f.write(f"{r[0]}\t{r[1]}\t{r[2]}\t{r[3]}\n")
    log(f"[PASO 1] Backup: {bpath} ({len(backup_rows)} componentes)")
else:
    log(f"[PASO 1] (dry-run) se respaldarían {len(backup_rows)} componentes")

# --- PASO 2: Consolidar duplicados ---
cur.execute("""
    SELECT version_id, material_id, SUM(quantity), ARRAY_AGG(id ORDER BY id)
    FROM design_version_components
    GROUP BY version_id, material_id HAVING COUNT(*) > 1
""")
dups = cur.fetchall()
for vid, mid, qty_total, ids in dups:
    cur.execute("UPDATE design_version_components SET quantity=%s WHERE id=%s", (qty_total, ids[0]))
    cur.execute("DELETE FROM design_version_components WHERE id = ANY(%s)", (ids[1:],))
log(f"[PASO 2] Duplicados consolidados: {len(dups)}")

# --- PASO 3: Negro Bruno Grupo 1 (eliminar) ---
cur.execute("""
    SELECT DISTINCT version_id FROM design_version_components
    WHERE material_id = %s AND version_id IN (
        SELECT dvc.version_id FROM design_version_components dvc
        JOIN materials m ON m.id = dvc.material_id
        WHERE m.category='Tablero' AND m.name NOT ILIKE '%%blanco%%'
          AND m.is_active=true AND m.id <> %s
    )
""", (NEGRO_BRUNO, NEGRO_BRUNO))
grupo1 = sorted([r[0] for r in cur.fetchall()])
cur.execute("DELETE FROM design_version_components WHERE material_id=%s AND version_id=ANY(%s)",
            (NEGRO_BRUNO, grupo1))
log(f"[PASO 3] Negro Bruno ELIMINADO (Grupo 1): {len(grupo1)} recetas {grupo1}")

# --- PASO 4: Negro Bruno Grupo 2 (sustituir) ---
cur.execute("SELECT DISTINCT version_id FROM design_version_components WHERE material_id=%s", (NEGRO_BRUNO,))
grupo2 = sorted([r[0] for r in cur.fetchall()])
cur.execute("UPDATE design_version_components SET material_id=%s WHERE material_id=%s AND version_id=ANY(%s)",
            (MDF_SUSTITUTO, NEGRO_BRUNO, grupo2))
log(f"[PASO 4] Negro Bruno SUSTITUIDO->833 (Grupo 2): {len(grupo2)} recetas")

# --- PASO 5: MiniFIX desdoblar ---
cur.execute("SELECT version_id, quantity FROM design_version_components WHERE material_id=%s", (MINIFIX,))
minifix = cur.fetchall()
for vid, qty in minifix:
    for mat in (PERNO, EXCENTRICO):
        cur.execute("SELECT id, quantity FROM design_version_components WHERE version_id=%s AND material_id=%s", (vid, mat))
        ex = cur.fetchone()
        if ex:
            cur.execute("UPDATE design_version_components SET quantity=%s WHERE id=%s", (ex[1]+qty, ex[0]))
        else:
            cur.execute("INSERT INTO design_version_components (version_id, material_id, quantity) VALUES (%s,%s,%s)", (vid, mat, qty))
    cur.execute("DELETE FROM design_version_components WHERE version_id=%s AND material_id=%s", (vid, MINIFIX))
log(f"[PASO 5] MiniFIX desdoblado: {len(minifix)} recetas")

# --- PASO 6: Recalcular estimated_cost (con el estado YA modificado) ---
log("\n[PASO 6] Recalculo de estimated_cost (antes -> despues):")
cambios_grandes = []
for vid in recetas:
    cur.execute("""
        SELECT ROUND(SUM(dvc.quantity * (m.current_cost / NULLIF(m.conversion_factor,0)))::numeric, 2)
        FROM design_version_components dvc
        JOIN materials m ON m.id = dvc.material_id
        WHERE dvc.version_id = %s
    """, (vid,))
    nuevo = cur.fetchone()[0]
    if nuevo is not None:
        cur.execute("UPDATE design_product_versions SET estimated_cost=%s WHERE id=%s", (nuevo, vid))
        antes = costo_antes.get(vid, 0)
        diff = float(nuevo) - antes
        marca = ""
        if abs(diff) >= 100:
            marca = f"   <<< CAMBIO GRANDE ({diff:+.2f})"
            cambios_grandes.append((vid, antes, float(nuevo), diff))
        log(f"  receta {vid}: {antes:.2f} -> {float(nuevo):.2f}{marca}")

# --- Resumen de cambios grandes ---
if cambios_grandes:
    log("\n  --- CAMBIOS GRANDES (>=$100) a revisar ---")
    for vid, a, n, d in cambios_grandes:
        log(f"    receta {vid}: {a:.2f} -> {n:.2f}  ({d:+.2f})")

# --- La receta 236 destacada ---
if 236 in recetas:
    cur.execute("SELECT estimated_cost FROM design_product_versions WHERE id=236")
    log(f"\n  >>> RECETA 236 (tu caso): estimated_cost final = {cur.fetchone()[0]}  (esperado ~46,151)")

# --- Cierre ---
if DRY_RUN:
    conn.rollback()
    log("\n" + "=" * 70)
    log("DRY-RUN: ROLLBACK hecho. La base NO fue modificada.")
    log("Los numeros de arriba SI reflejan el estado final real (se simulo en transaccion).")
    log("Para aplicar de verdad:  python3 sanear_recetas_v2.py --apply")
    log("=" * 70)
else:
    conn.commit()
    log("\n" + "=" * 70)
    log("CAMBIOS APLICADOS Y COMMITEADOS.")
    log("=" * 70)

cur.close()
conn.close()