import shutil
import time
import csv
import io
import os
import math  # Para el redondeo (Ceiling)
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, status
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError 
from app.core.database import get_session

# --- MODELOS ---
from app.models.foundations import GlobalConfig, Provider, Client, TaxRate
from app.models.material import Material

router = APIRouter()

# -----------------------------------------------------------------------------
# UTILIDAD: Definición de Rutas Físicas
# -----------------------------------------------------------------------------
BASE_DIR = Path(os.getcwd())
UPLOADS_DIR = BASE_DIR / "static" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# ==========================================
# 1. CONFIGURACIÓN GLOBAL & IDENTIDAD
# ==========================================
@router.get("/config", response_model=GlobalConfig)
def get_global_config(session: Session = Depends(get_session)):
    config = session.exec(select(GlobalConfig)).first()
    if not config:
        default_config = GlobalConfig(
            company_name="Mi Empresa SGP",
            target_profit_margin=0.35,
            cost_tolerance_percent=0.03,
            quote_validity_days=15,
            default_edgebanding_factor=1.10,
            annual_sales_target=0,
            last_year_sales=0
        )
        session.add(default_config)
        session.commit()
        session.refresh(default_config)
        return default_config
    return config

@router.put("/config", response_model=GlobalConfig)
def update_global_config(config_in: GlobalConfig, session: Session = Depends(get_session)):
    db_config = session.exec(select(GlobalConfig)).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    
    config_data = config_in.model_dump(exclude_unset=True)
    config_data.pop("id", None)
    
    if "logo_path" in config_data:
         if config_data["logo_path"] is None:
             config_data.pop("logo_path")

    for key, value in config_data.items():
        setattr(db_config, key, value)
    
    session.add(db_config)
    session.commit()
    session.refresh(db_config)
    return db_config

@router.post("/config/upload-logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    if file.content_type not in ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]:
        raise HTTPException(status_code=400, detail="Formato inválido. Use PNG, JPG o SVG.")

    file_ext = file.filename.split(".")[-1]
    filename = f"logo_{int(time.time())}.{file_ext}"
    file_dest = UPLOADS_DIR / filename
    
    try:
        with open(file_dest, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        print(f"Error escritura disco: {e}")
        raise HTTPException(status_code=500, detail="Error interno al guardar imagen.")

    db_config = session.exec(select(GlobalConfig)).first()
    if not db_config:
        db_config = GlobalConfig(company_name="Empresa Nueva")
        session.add(db_config)

    if db_config.logo_path:
        try:
            old_filename = db_config.logo_path.split("/")[-1]
            old_file_path = UPLOADS_DIR / old_filename
            if old_file_path.exists():
                old_file_path.unlink()
        except Exception:
            pass 

    web_url = f"http://localhost:8000/static/uploads/{filename}"
    db_config.logo_path = web_url
    
    session.add(db_config)
    session.commit()
    session.refresh(db_config)

    return {"url": web_url, "message": "Logo actualizado exitosamente"}

# ==========================================
# 2. PROVEEDORES
# ==========================================
@router.get("/providers", response_model=List[Provider])
def read_providers(session: Session = Depends(get_session)):
    return session.exec(select(Provider).where(Provider.is_active == True)).all()

@router.post("/providers", response_model=Provider)
def create_provider(provider: Provider, session: Session = Depends(get_session)):
    provider.is_active = True
    session.add(provider)
    session.commit()
    session.refresh(provider)
    return provider

@router.put("/providers/{provider_id}", response_model=Provider)
def update_provider(provider_id: int, provider_in: Provider, session: Session = Depends(get_session)):
    db_provider = session.get(Provider, provider_id)
    if not db_provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    
    provider_data = provider_in.model_dump(exclude_unset=True)
    provider_data.pop("id", None)
    for key, value in provider_data.items():
        setattr(db_provider, key, value)
        
    session.add(db_provider)
    session.commit()
    session.refresh(db_provider)
    return db_provider

@router.delete("/providers/{provider_id}")
def delete_provider(provider_id: int, session: Session = Depends(get_session)):
    db_provider = session.get(Provider, provider_id)
    if not db_provider:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    db_provider.is_active = False
    session.add(db_provider)
    session.commit()
    return {"ok": True}

# ==========================================
# 3. CLIENTES
# ==========================================
@router.get("/clients", response_model=List[Client])
def read_clients(session: Session = Depends(get_session)):
    return session.exec(select(Client).where(Client.is_active == True)).all()

@router.post("/clients", response_model=Client)
def create_client(client: Client, session: Session = Depends(get_session)):
    client.is_active = True
    session.add(client)
    session.commit()
    session.refresh(client)
    return client

@router.put("/clients/{client_id}", response_model=Client)
def update_client(client_id: int, client_in: Client, session: Session = Depends(get_session)):
    db_client = session.get(Client, client_id)
    if not db_client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    client_data = client_in.model_dump(exclude_unset=True)
    client_data.pop("id", None)
    client_data.pop("registration_date", None)
    
    for key, value in client_data.items():
        setattr(db_client, key, value)
    
    session.add(db_client)
    session.commit()
    session.refresh(db_client)
    return db_client

@router.delete("/clients/{client_id}")
def delete_client(client_id: int, session: Session = Depends(get_session)):
    db_client = session.get(Client, client_id)
    if not db_client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    db_client.is_active = False
    session.add(db_client)
    session.commit()
    return {"ok": True}

# ==========================================
# 4. TASAS DE IMPUESTOS
# ==========================================
@router.get("/tax-rates", response_model=List[TaxRate])
def read_tax_rates(session: Session = Depends(get_session)):
    return session.exec(select(TaxRate)).all()

@router.post("/tax-rates", response_model=TaxRate)
def create_tax_rate(tax_rate: TaxRate, session: Session = Depends(get_session)):
    tax_rate.is_active = True
    session.add(tax_rate)
    session.commit()
    session.refresh(tax_rate)
    return tax_rate

@router.put("/tax-rates/{tax_id}/toggle", response_model=TaxRate)
def toggle_tax_rate(tax_id: int, session: Session = Depends(get_session)):
    tax = session.get(TaxRate, tax_id)
    if not tax:
        raise HTTPException(status_code=404, detail="Impuesto no encontrado")
    
    tax.is_active = not tax.is_active
    session.add(tax)
    session.commit()
    session.refresh(tax)
    return tax

# ==========================================
# 5. MATERIALES
# ==========================================
@router.get("/materials", response_model=List[Material])
def read_materials(session: Session = Depends(get_session)):
    return session.exec(select(Material).where(Material.is_active == True)).all()

@router.post("/materials", response_model=Material)
def create_material(material: Material, session: Session = Depends(get_session)):
    try:
        material.is_active = True
        session.add(material)
        session.commit()
        session.refresh(material)
        return material
    except IntegrityError:
        session.rollback()
        existing = session.exec(select(Material).where(Material.sku == material.sku)).first()
        if existing:
            if existing.name == material.name and existing.is_active:
                return existing 
            if not existing.is_active:
                material_data = material.model_dump(exclude_unset=True)
                for key, value in material_data.items():
                    if key != "id":
                        setattr(existing, key, value)
                existing.is_active = True
                session.add(existing)
                session.commit()
                session.refresh(existing)
                return existing
        raise HTTPException(status_code=400, detail=f"El SKU '{material.sku}' ya está ocupado.")

@router.put("/materials/{material_id}", response_model=Material)
def update_material(material_id: int, material_in: Material, session: Session = Depends(get_session)):
    db_material = session.get(Material, material_id)
    if not db_material:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    
    material_data = material_in.model_dump(exclude_unset=True)
    material_data.pop("id", None)
    for key, value in material_data.items():
        setattr(db_material, key, value)
        
    session.add(db_material)
    session.commit()
    session.refresh(db_material)
    return db_material

@router.delete("/materials/{material_id}")
def delete_material(material_id: int, session: Session = Depends(get_session)):
    db_material = session.get(Material, material_id)
    if not db_material:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    db_material.is_active = False
    session.add(db_material)
    session.commit()
    return {"ok": True}

# ==========================================
# 6. IMPORTACIÓN MASIVA (CON AUTO-PROVEEDOR)
# ==========================================
@router.post("/materials/import-csv")
async def import_materials_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un CSV.")

    content = await file.read()
    try:
        csv_string = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        csv_string = content.decode('latin-1')

    sample = csv_string[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample)
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ','

    csv_reader = csv.DictReader(io.StringIO(csv_string), delimiter=delimiter)
    summary = {"processed": 0, "created": 0, "updated": 0, "errors": []}

    # CACHÉ DE PROVEEDORES (Para no consultar la BD en cada fila)
    # Estructura: {'NOMBRE_MAYUSCULAS': provider_id}
    provider_cache = {}

    def parse_money(value):
        if not value: return 0.0
        clean = value.replace('$', '').replace(',', '').strip()
        try:
            return float(clean)
        except ValueError:
            return 0.0
    
    for row_idx, row in enumerate(csv_reader):
        try:
            clean_row = {k.strip().lower(): v.strip() for k, v in row.items() if k}
            if 'sku' not in clean_row or 'name' not in clean_row:
                continue 

            sku_val = clean_row['sku'].upper()
            
            # --- A. LÓGICA INTELIGENTE DE PROVEEDOR ---
            # Buscamos 'proveedor' (español) o 'provider' (inglés)
            provider_name_raw = clean_row.get('proveedor') or clean_row.get('provider')
            final_provider_id = None

            if provider_name_raw:
                p_name_clean = provider_name_raw.strip()
                p_key = p_name_clean.upper() # Clave para el caché

                # 1. ¿Está en memoria?
                if p_key in provider_cache:
                    final_provider_id = provider_cache[p_key]
                else:
                    # 2. Buscar en BD
                    existing_prov = session.exec(select(Provider).where(Provider.business_name == p_name_clean)).first()
                    
                    if existing_prov:
                        final_provider_id = existing_prov.id
                    else:
                        # 3. CREAR NUEVO (Auto-Alta)
                        new_prov = Provider(
                            business_name=p_name_clean,
                            credit_days=0, # Valor por defecto seguro
                            is_active=True
                        )
                        session.add(new_prov)
                        session.commit() # ¡Commit inmediato para obtener ID!
                        session.refresh(new_prov)
                        final_provider_id = new_prov.id
                    
                    # Guardar en caché para la siguiente vez
                    provider_cache[p_key] = final_provider_id

            # --- B. LÓGICA DE COSTOS SGP V3 ---
            raw_factor = parse_money(clean_row.get('conversion_factor'))
            conversion_factor = raw_factor if raw_factor > 0 else 1.0
            
            purchase_price = parse_money(clean_row.get('current_cost'))
            
            raw_unit_cost = purchase_price / conversion_factor
            final_unit_cost = math.ceil(raw_unit_cost * 100) / 100
            
            # -----------------------------------------------------
            
            material_data = {
                "sku": sku_val,
                "name": clean_row['name'],
                "category": clean_row.get('category', 'General'),
                "purchase_unit": clean_row.get('purchase_unit', 'Pieza'),
                "usage_unit": clean_row.get('usage_unit', 'Pieza'),
                "conversion_factor": conversion_factor,
                "current_cost": final_unit_cost,
                
                # AQUI USAMOS EL ID CALCULADO (O None si venía vacío)
                "provider_id": final_provider_id,
                
                "physical_stock": 0.0,
                "committed_stock": 0.0,
                "associated_element_sku": clean_row.get('associated_element_sku', None),
                "is_active": True
            }

            raw_route = clean_row.get('production_route', 'MATERIAL').upper()
            valid_routes = ["MATERIAL", "PROCESO", "CONSUMIBLE", "SERVICIO"]
            material_data["production_route"] = raw_route if raw_route in valid_routes else "MATERIAL"
            
            existing_mat = session.exec(select(Material).where(Material.sku == sku_val)).first()

            if existing_mat:
                for k, v in material_data.items():
                    # No sobreescribimos stock ni la relación proveedor si ya existe y el CSV viene vacío
                    if k in ["physical_stock", "committed_stock"]: continue 
                    if k == "provider_id" and v is None: continue 
                    
                    setattr(existing_mat, k, v)
                session.add(existing_mat)
                summary["updated"] += 1
            else:
                new_mat = Material(**material_data)
                session.add(new_mat)
                summary["created"] += 1
            
            summary["processed"] += 1

        except Exception as e:
            summary["errors"].append(f"Fila {row_idx + 2}: {str(e)}")

    try:
        session.commit()
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error DB: {str(e)}")
        
    return summary