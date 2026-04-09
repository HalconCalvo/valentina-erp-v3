import csv
import os
from sqlmodel import Session, create_engine, select
from app.models.foundations import Material

# ---> LA MEJORA PARA RENDER: Conexión Directa a Base de Datos <---
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local_dev.db")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://")

engine = create_engine(DATABASE_URL)
CSV_FILE = os.path.join(os.path.dirname(__file__), 'Materiales.csv')

# --- DICCIONARIO DE TRADUCCIÓN (MAPPER) ---
CATEGORY_MAP = {
    "herrajes": "Herraje",
    "herraje": "Herraje",
    "chapacinta": "Consumible",
    "insumos": "Consumible",
    "electricidad": "Accesorio",
    "electrodoméstico": "Accesorio",
    "vidrio": "Accesorio",
    "cristal": "Accesorio",
    "especial": "Servicios",
    "proceso": "Servicios",
    "m. o.": "Servicios",
    "flete": "Servicios",
    "tablero": "Tablero",
    "piedra": "Piedra"
}

def normalize_category(raw_cat):
    """Limpia y traduce la categoría"""
    if not raw_cat:
        return "Consumible" # Default
    
    key = raw_cat.strip().lower()
    for k, v in CATEGORY_MAP.items():
        if k in key:
            return v
    return "Accesorio" # Fallback seguro

def determine_route(category, raw_route):
    """Calcula la ruta correcta."""
    if category == "Tablero":
        return "Madera"
    if category == "Piedra":
        return "Piedra"
    return "Insumo"

def clean_float(value):
    if not value: return 0.0
    if isinstance(value, (int, float)): return float(value)
    clean = value.replace('$', '').replace(',', '').strip()
    try:
        return float(clean)
    except ValueError:
        return 0.0

def import_materials():
    print(f"--- INICIANDO IMPORTACIÓN DIRECTA (V3.6) ---")
    
    if not os.path.exists(CSV_FILE):
        print(f"❌ Error: No se encuentra {CSV_FILE}")
        return

    exitos = 0
    errores = 0
    materiales_a_guardar = []

    try:
        with open(CSV_FILE, mode='r', encoding='utf-8-sig', errors='replace') as f:
            reader = csv.DictReader(f)
            reader.fieldnames = [name.lower().strip() if name else "" for name in reader.fieldnames]

            for row in reader:
                if not row.get('sku'): continue

                final_category = normalize_category(row.get('category', ''))
                final_route = determine_route(final_category, row.get('production_route', ''))

                nuevo_material = Material(
                    sku=row['sku'].strip(),
                    name=row['name'].strip(),
                    category=final_category,
                    purchase_unit=row.get('purchase_unit', 'Pza').strip(),
                    usage_unit=row.get('usage_unit', 'Pza').strip(),
                    conversion_factor=clean_float(row.get('conversion_factor', 1.0)),
                    current_cost=clean_float(row.get('current_cost', 0.0)),
                    production_route=final_route,
                    route_safety_factor=clean_float(row.get('route_safety_factor', 1.0)),
                    is_active=True
                )
                materiales_a_guardar.append(nuevo_material)

        # Inyección directa a la BD
        with Session(engine) as session:
            for mat in materiales_a_guardar:
                # Evitar duplicados por SKU
                existe = session.exec(select(Material).where(Material.sku == mat.sku)).first()
                if not existe:
                    session.add(mat)
                    exitos += 1
                else:
                    errores += 1
            session.commit()

    except Exception as e:
        print(f"🔥 Error Crítico: {e}")

    print("------------------------------------------------")
    print(f"RESUMEN FINAL: Importados: {exitos} | Omitidos (Duplicados): {errores}")
    print("------------------------------------------------")

if __name__ == "__main__":
    import_materials()