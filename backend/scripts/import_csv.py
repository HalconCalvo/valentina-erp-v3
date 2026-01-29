import csv
import requests
import os
import sys

# Configuración
API_URL = "http://127.0.0.1:8000/api/v1/cimientos/materials/"
CSV_FILE = os.path.join(os.path.dirname(__file__), 'Materiales.csv')

# --- DICCIONARIO DE TRADUCCIÓN (MAPPER) ---
# Convierte tus categorías viejas a las 6 permitidas por el sistema
CATEGORY_MAP = {
    "herrajes": "Herraje",       # Plural a Singular
    "herraje": "Herraje",
    "chapacinta": "Consumible",  # Chapacinta ahora es Consumible (o Accesorio)
    "insumos": "Consumible",
    "electricidad": "Accesorio",
    "electrodoméstico": "Accesorio",
    "vidrio": "Accesorio",
    "cristal": "Accesorio",
    "especial": "Servicios",
    "proceso": "Servicios",      # Mano de obra/Procesos son Servicios
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
    # Buscar coincidencia exacta o parcial
    for k, v in CATEGORY_MAP.items():
        if k in key:
            return v
    return "Accesorio" # Fallback seguro

def determine_route(category, raw_route):
    """
    Calcula la ruta correcta.
    Ignora basura como 'white', 'color', 'none' del CSV.
    """
    # Si la categoría es Tablero, la ruta SIEMPRE es Madera
    if category == "Tablero":
        return "Madera"
    
    # Si la categoría es Piedra, la ruta SIEMPRE es Piedra
    if category == "Piedra":
        return "Piedra"
    
    # Todo lo demás (Herrajes, Consumibles, Servicios) va a Insumo
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
    print(f"--- INICIANDO IMPORTACIÓN INTELIGENTE (V2) ---")
    
    if not os.path.exists(CSV_FILE):
        print(f"❌ Error: No se encuentra {CSV_FILE}")
        return

    exitos = 0
    errores = 0

    try:
        with open(CSV_FILE, mode='r', encoding='utf-8-sig', errors='replace') as f:
            reader = csv.DictReader(f)
            
            # Normalizar encabezados del CSV a minúsculas para evitar errores de Key
            reader.fieldnames = [name.lower().strip() for name in reader.fieldnames]

            for row in reader:
                if not row.get('sku'): continue

                # 1. TRADUCCIÓN DE DATOS
                raw_cat = row.get('category', '')
                final_category = normalize_category(raw_cat)
                
                raw_route = row.get('production_route', '')
                final_route = determine_route(final_category, raw_route)

                # 2. CONSTRUCCIÓN DEL PAYLOAD
                payload = {
                    "sku": row['sku'].strip(),
                    "name": row['name'].strip(),
                    "category": final_category,          # Dato Corregido
                    "purchase_unit": row.get('purchase_unit', 'Pza').strip(),
                    "usage_unit": row.get('usage_unit', 'Pza').strip(),
                    "conversion_factor": clean_float(row.get('conversion_factor', 1.0)),
                    "current_cost": clean_float(row.get('current_cost', 0.0)),
                    "production_route": final_route,     # Dato Corregido
                    "route_safety_factor": clean_float(row.get('route_safety_factor', 1.0))
                }

                # 3. ENVÍO
                try:
                    response = requests.post(API_URL, json=payload)
                    if response.status_code == 200:
                        print(f"✅ {payload['sku']}: Importado como {final_category} -> {final_route}")
                        exitos += 1
                    else:
                        # Si falla, imprimimos el error pero seguimos
                        print(f"⚠️ {payload['sku']} ({final_category}): {response.text}")
                        errores += 1
                except Exception as e:
                    print(f"🚨 Error de Red: {e}")
                    errores += 1

    except Exception as e:
        print(f"🔥 Error Crítico: {e}")

    print("------------------------------------------------")
    print(f"RESUMEN FINAL: Éxitos: {exitos} | Errores: {errores}")
    print("------------------------------------------------")

if __name__ == "__main__":
    import_materials()