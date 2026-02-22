import csv
import io
import math
from uuid import uuid4  # <--- AGREGADO PARA NOMBRES ÚNICOS
from typing import List
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from app.core.database import get_session
from app.services.cloud_storage import upload_to_gcs  # <--- LA TUBERÍA BLINDADA

# --- MODELOS ---
from app.models.foundations import GlobalConfig, Provider, Client, TaxRate
from app.models.material import Material

router = APIRouter()

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
        # Si no existe, lo creamos al vuelo
        db_config = GlobalConfig(**config_in.dict(exclude={"id"}))
        session.add(db_config)
        session.commit()
        session.refresh(db_config)
        return db_config
    
    config_data = config_in.model_dump(exclude_unset=True)
    config_data.pop("id", None)
    
    # PROTECCIÓN: Evitar borrar el logo si el frontend manda null
    if "logo_path" in config_data:
         if config_data["logo_path"] is None:
             config_data.pop("logo_path")

    for key, value in config_data.items():
        setattr(db_config, key, value)
    
    session.add(db_config)
    session.commit()
    session.refresh(db_config)
    return db_config

# --- SUBIDA DE LOGO CORREGIDA (Igual que Design) ---
@router.post("/config/upload-logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    """
    Sube el logo a Google Cloud Storage y actualiza la configuración.
    """
    # 1. Validar formato
    if file.content_type not in ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]:
        raise HTTPException(status_code=400, detail="Formato inválido. Use PNG, JPG o SVG.")

    # 2. Generar nombre único (UUID para evitar caché)
    file_ext = file.filename.split(".")[-1]
    filename = f"logos/logo_{uuid4().hex[:8]}.{file_ext}"
    
    # 3. Reiniciar puntero del archivo (Seguridad)
    await file.seek(0)

    # 4. USAR EL SERVICIO DE NUBE
    # Pasamos content_type explícitamente para que el navegador lo muestre y no lo descargue
    public_url = upload_to_gcs(file.file, filename, content_type=file.content_type)

    if not public_url:
        raise HTTPException(status_code=500, detail="Error al subir la imagen a Google Cloud.")

    # 5. Guardar URL en Base de Datos
    db_config = session.exec(select(GlobalConfig)).first()
    if not db_config:
        db_config = GlobalConfig(company_name="Empresa Nueva")
        session.add(db_config)

    db_config.logo_path = public_url
    
    session.add(db_config)
    session.commit()
    session.refresh(db_config)

    return {"url": public_url, "message": "Logo actualizado exitosamente"}

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
# --- IMPORTE NECESARIO (Asegúrate de que 'Provider' esté importado al inicio del archivo) ---
@router.get("/materials")
def read_materials(session: Session = Depends(get_session)):
    # Usamos un JOIN para traer el nombre del proveedor
    query = (
        select(Material, Provider.business_name)
        .outerjoin(Provider, Material.provider_id == Provider.id)
        .where(Material.is_active == True)
    )
    results = session.exec(query).all()
    
    # Armamos la respuesta a mano para incluir el 'provider_name'
    materials_list = []
    for material, provider_name in results:
        mat_dict = material.model_dump()
        mat_dict["provider_name"] = provider_name
        materials_list.append(mat_dict)
        
    return materials_list

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

    # CACHÉ DE PROVEEDORES
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
            
            # PROVEEDOR
            provider_name_raw = clean_row.get('proveedor') or clean_row.get('provider')
            final_provider_id = None

            if provider_name_raw:
                p_name_clean = provider_name_raw.strip()
                p_key = p_name_clean.upper()

                if p_key in provider_cache:
                    final_provider_id = provider_cache[p_key]
                else:
                    existing_prov = session.exec(select(Provider).where(Provider.business_name == p_name_clean)).first()
                    if existing_prov:
                        final_provider_id = existing_prov.id
                    else:
                        new_prov = Provider(business_name=p_name_clean, credit_days=0, is_active=True)
                        session.add(new_prov)
                        session.commit()
                        session.refresh(new_prov)
                        final_provider_id = new_prov.id
                    provider_cache[p_key] = final_provider_id

            # COSTOS SGP V3
            raw_factor = parse_money(clean_row.get('conversion_factor'))
            conversion_factor = raw_factor if raw_factor > 0 else 1.0
            
            purchase_price = parse_money(clean_row.get('current_cost'))
            raw_unit_cost = purchase_price / conversion_factor
            final_unit_cost = math.ceil(raw_unit_cost * 100) / 100
            
            material_data = {
                "sku": sku_val,
                "name": clean_row['name'],
                "category": clean_row.get('category', 'General'),
                "purchase_unit": clean_row.get('purchase_unit', 'Pieza'),
                "usage_unit": clean_row.get('usage_unit', 'Pieza'),
                "conversion_factor": conversion_factor,
                "current_cost": final_unit_cost,
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