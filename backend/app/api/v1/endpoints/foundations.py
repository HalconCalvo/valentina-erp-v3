import csv
import io
import math
from uuid import uuid4  # <--- AGREGADO PARA NOMBRES ÚNICOS
from typing import List
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from app.core.database import get_session
from app.core.deps import CurrentUser
from app.services.cloud_storage import upload_to_gcs  # <--- LA TUBERÍA BLINDADA

# --- MODELOS ---
from app.models.foundations import GlobalConfig, Provider, Client, TaxRate
from app.models.material import Material

router = APIRouter()

# ==========================================
# 1. CONFIGURACIÓN GLOBAL & IDENTIDAD
# ==========================================
@router.get("/config", response_model=GlobalConfig)
def get_global_config(current_user: CurrentUser, session: Session = Depends(get_session)):
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

@router.get("/logo-base64")
def get_logo_base64(session: Session = Depends(get_session)):
    """
    Descarga el logo de la empresa desde GCS y lo devuelve como base64.
    Evita el problema de CORS al cargar imágenes desde el frontend para canvas/PDF.
    """
    import base64
    import urllib.request

    config = session.exec(select(GlobalConfig)).first()
    if not config or not config.logo_path:
        return {"base64": None, "content_type": None}

    try:
        with urllib.request.urlopen(config.logo_path, timeout=5) as response:
            image_data = response.read()
            content_type = response.headers.get('Content-Type', 'image/png')
            encoded = base64.b64encode(image_data).decode('utf-8')
            return {
                "base64": f"data:{content_type};base64,{encoded}",
                "content_type": content_type,
            }
    except Exception:
        return {"base64": None, "content_type": None}


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

@router.post("/providers/import-csv")
async def import_providers_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    """Importación masiva de proveedores desde CSV."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un CSV.")

    content = await file.read()
    try:
        csv_string = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        csv_string = content.decode('latin-1')

    import csv as csv_module

    sample = csv_string[:2048]
    try:
        dialect = csv_module.Sniffer().sniff(sample)
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ','

    csv_reader = csv_module.DictReader(io.StringIO(csv_string), delimiter=delimiter)
    summary = {"processed": 0, "created": 0, "updated": 0, "errors": []}

    for row_idx, row in enumerate(csv_reader):
        try:
            clean = {k.strip().lower(): (v.strip() if v else '') for k, v in row.items() if k}
            business_name = clean.get('business_name', '').strip()
            if not business_name:
                continue

            credit_days = 0
            try:
                credit_days = int(clean.get('credit_days', 0) or 0)
            except ValueError:
                credit_days = 0

            existing = session.exec(
                select(Provider).where(Provider.business_name == business_name)
            ).first()

            data = {
                "business_name": business_name,
                "rfc_tax_id": clean.get('rfc_tax_id') or None,
                "credit_days": credit_days,
                "phone": clean.get('phone') or None,
                "phone2": clean.get('phone2') or None,
                "contact_name": clean.get('contact_name') or None,
                "contact_cellphone": clean.get('contact_cellphone') or None,
                "contact_email": clean.get('contact_email') or None,
                "is_active": True,
            }

            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
                summary["updated"] += 1
            else:
                session.add(Provider(**data))
                summary["created"] += 1

            summary["processed"] += 1

        except Exception as e:
            summary["errors"].append(f"Fila {row_idx + 2}: {str(e)}")

    session.commit()
    return summary

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

@router.post("/clients/import-csv")
async def import_clients_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    """Importación masiva de clientes desde CSV."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un CSV.")

    content = await file.read()
    try:
        csv_string = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        csv_string = content.decode('latin-1')

    import csv as csv_module

    sample = csv_string[:2048]
    try:
        dialect = csv_module.Sniffer().sniff(sample)
        delimiter = dialect.delimiter
    except Exception:
        delimiter = ','

    csv_reader = csv_module.DictReader(io.StringIO(csv_string), delimiter=delimiter)
    summary = {"processed": 0, "created": 0, "updated": 0, "errors": []}

    for row_idx, row in enumerate(csv_reader):
        try:
            clean = {k.strip().lower(): (v.strip() if v else '') for k, v in row.items() if k}
            full_name = clean.get('full_name', '').strip()
            email = clean.get('email', '').strip()
            phone = clean.get('phone', '').strip()
            if not full_name or not email or not phone:
                continue

            existing = session.exec(
                select(Client).where(Client.full_name == full_name)
            ).first()

            data = {
                "full_name": full_name,
                "email": email,
                "phone": phone,
                "rfc_tax_id": clean.get('rfc_tax_id') or None,
                "fiscal_address": clean.get('fiscal_address') or None,
                "contact_name": clean.get('contact_name') or None,
                "contact_phone": clean.get('contact_phone') or None,
                "contact_dept": clean.get('contact_dept') or None,
                "contact_email": clean.get('contact_email') or None,
                "contact2_name": clean.get('contact2_name') or None,
                "contact2_phone": clean.get('contact2_phone') or None,
                "contact2_dept": clean.get('contact2_dept') or None,
                "contact2_email": clean.get('contact2_email') or None,
                "contact3_name": clean.get('contact3_name') or None,
                "contact3_phone": clean.get('contact3_phone') or None,
                "contact3_dept": clean.get('contact3_dept') or None,
                "contact3_email": clean.get('contact3_email') or None,
                "contact4_name": clean.get('contact4_name') or None,
                "contact4_phone": clean.get('contact4_phone') or None,
                "contact4_dept": clean.get('contact4_dept') or None,
                "contact4_email": clean.get('contact4_email') or None,
                "notes": clean.get('notes') or None,
                "is_active": True,
            }

            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
                summary["updated"] += 1
            else:
                session.add(Client(**data))
                summary["created"] += 1

            summary["processed"] += 1

        except Exception as e:
            summary["errors"].append(f"Fila {row_idx + 2}: {str(e)}")

    session.commit()
    return summary

# ==========================================
# 4. TASAS DE IMPUESTOS
# ==========================================
@router.get("/tax-rates", response_model=List[TaxRate])
def read_tax_rates(session: Session = Depends(get_session)):
    return session.exec(select(TaxRate).where(TaxRate.is_active == True)).all()

@router.post("/tax-rates", response_model=TaxRate)
def create_tax_rate(tax_rate: TaxRate, session: Session = Depends(get_session)):
    tax_rate.is_active = True
    session.add(tax_rate)
    session.commit()
    session.refresh(tax_rate)
    return tax_rate

@router.put("/tax-rates/{tax_id}", response_model=TaxRate)
def update_tax_rate(tax_id: int, tax_in: TaxRate, session: Session = Depends(get_session)):
    db_tax = session.get(TaxRate, tax_id)
    if not db_tax:
        raise HTTPException(status_code=404, detail="Impuesto no encontrado")
    
    tax_data = tax_in.model_dump(exclude_unset=True)
    tax_data.pop("id", None)
    
    for key, value in tax_data.items():
        setattr(db_tax, key, value)
        
    session.add(db_tax)
    session.commit()
    session.refresh(db_tax)
    return db_tax

@router.delete("/tax-rates/{tax_id}")
def delete_tax_rate(tax_id: int, session: Session = Depends(get_session)):
    db_tax = session.get(TaxRate, tax_id)
    if not db_tax:
        raise HTTPException(status_code=404, detail="Impuesto no encontrado")
    
    # Hacemos Soft Delete (Borrado Lógico) para no romper las ventas que ya lo usaron
    db_tax.is_active = False
    session.add(db_tax)
    session.commit()
    return {"ok": True, "message": "Impuesto eliminado correctamente"}

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
@router.patch("/materials/{material_id}/adjust-stock")
def adjust_material_stock(
    material_id: int,
    body: dict,
    current_user: CurrentUser,
    session: Session = Depends(get_session),
):
    """
    Ajusta el stock físico de un material.
    body: { "counted_quantity": float, "notes": str }
    Genera AJUSTE_POSITIVO o AJUSTE_NEGATIVO según la diferencia.
    """
    material = session.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material no encontrado")

    counted = float(body.get("counted_quantity", 0))
    notes = body.get("notes", f"Inventario físico")
    difference = counted - material.physical_stock

    if difference == 0:
        return {"ok": True, "message": "Sin diferencia, stock no modificado"}

    movement_type = "AJUSTE_POSITIVO" if difference > 0 else "AJUSTE_NEGATIVO"
    material.physical_stock = counted
    session.add(material)
    session.commit()
    session.refresh(material)

    return {
        "ok": True,
        "material_id": material_id,
        "movement_type": movement_type,
        "difference": difference,
        "new_stock": material.physical_stock,
    }


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
# 6. IMPORTACIÓN MASIVA (PROCESAMIENTO EN BLOQUE / BULK UPSERT)
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

    def parse_money(value):
        if not value: return 0.0
        clean = value.replace('$', '').replace(',', '').strip()
        try:
            return float(clean)
        except ValueError:
            return 0.0

    # =========================================================
    # FASE 1: Lectura en memoria y recolección de llaves únicas
    # =========================================================
    parsed_rows = []
    unique_skus = set()
    unique_providers = set()

    for row_idx, row in enumerate(csv_reader):
        clean_row = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        if 'sku' not in clean_row or 'name' not in clean_row:
            continue 

        sku_val = clean_row['sku'].upper()
        unique_skus.add(sku_val)
        
        provider_name_raw = clean_row.get('proveedor') or clean_row.get('provider')
        if provider_name_raw:
            unique_providers.add(provider_name_raw.strip())
            
        parsed_rows.append({"idx": row_idx, "data": clean_row, "sku": sku_val})

    if not parsed_rows:
        return summary

    # =========================================================
    # FASE 2: Procesamiento en Bloque de Proveedores (1 solo viaje)
    # =========================================================
    provider_map = {}
    if unique_providers:
        # Traemos todos los proveedores existentes de golpe
        existing_provs = session.exec(select(Provider).where(Provider.business_name.in_(list(unique_providers)))).all()
        for p in existing_provs:
            provider_map[p.business_name.upper()] = p.id
        
        new_provs_to_create = []
        for p_name in unique_providers:
            if p_name.upper() not in provider_map:
                new_provs_to_create.append(Provider(business_name=p_name, credit_days=0, is_active=True))
        
        # Insertamos los nuevos proveedores de golpe para obtener sus IDs
        if new_provs_to_create:
            session.add_all(new_provs_to_create)
            session.flush() # Sincroniza con DB sin cerrar la transacción
            for p in new_provs_to_create:
                provider_map[p.business_name.upper()] = p.id

    # =========================================================
    # FASE 3: Procesamiento en Bloque de Materiales (La cura al N+1)
    # =========================================================
    # Traemos todos los materiales que coinciden con los SKUs del CSV de un solo golpe
    existing_materials = session.exec(select(Material).where(Material.sku.in_(list(unique_skus)))).all()
    material_map = {m.sku: m for m in existing_materials}

    new_materials_to_create = []
    valid_routes = ["MATERIAL", "PROCESO", "CONSUMIBLE", "SERVICIO"]

    # =========================================================
    # FASE 4: Cruce de datos en la memoria RAM (Milisegundos)
    # =========================================================
    for item in parsed_rows:
        try:
            clean_row = item["data"]
            sku_val = item["sku"]

            # Asignación de Proveedor desde el mapa en memoria
            provider_name_raw = clean_row.get('proveedor') or clean_row.get('provider')
            final_provider_id = None
            if provider_name_raw:
                final_provider_id = provider_map.get(provider_name_raw.strip().upper())

            # Cálculos financieros
            raw_factor = parse_money(clean_row.get('conversion_factor'))
            conversion_factor = raw_factor if raw_factor > 0 else 1.0
            
            purchase_price = parse_money(clean_row.get('current_cost'))
            raw_unit_cost = purchase_price / conversion_factor
            final_unit_cost = math.ceil(raw_unit_cost * 100) / 100
            
            raw_route = clean_row.get('production_route', 'MATERIAL').upper()
            final_route = raw_route if raw_route in valid_routes else "MATERIAL"
            
            material_data = {
                "sku": sku_val,
                "name": clean_row['name'],
                "category": clean_row.get('category', 'General'),
                "purchase_unit": clean_row.get('purchase_unit', 'Pieza'),
                "usage_unit": clean_row.get('usage_unit', 'Pieza'),
                "conversion_factor": conversion_factor,
                "current_cost": final_unit_cost,
                "provider_id": final_provider_id,
                "associated_element_sku": clean_row.get('associated_element_sku', None),
                "production_route": final_route,
                "is_active": True
            }

            existing_mat = material_map.get(sku_val)

            if existing_mat:
                # Si existe, actualizamos sus atributos (el ORM lo trackea en memoria)
                for k, v in material_data.items():
                    if k == "provider_id" and v is None: continue 
                    setattr(existing_mat, k, v)
                summary["updated"] += 1
            else:
                # Si es nuevo, lo preparamos para inserción masiva
                material_data["physical_stock"] = 0.0
                material_data["committed_stock"] = 0.0
                new_mat = Material(**material_data)
                new_materials_to_create.append(new_mat)
                # Lo metemos al mapa por si el CSV trae el mismo SKU duplicado más abajo
                material_map[sku_val] = new_mat
                summary["created"] += 1
            
            summary["processed"] += 1

        except Exception as e:
            summary["errors"].append(f"Fila {item['idx'] + 2}: {str(e)}")

    # =========================================================
    # FASE 5: Impacto Final en Base de Datos (1 solo commit)
    # =========================================================
    try:
        if new_materials_to_create:
            session.add_all(new_materials_to_create)
        session.commit()
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Error DB: {str(e)}")
        
    return summary