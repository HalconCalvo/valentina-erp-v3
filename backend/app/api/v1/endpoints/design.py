from typing import List, Any
import math
import time 
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlmodel import Session, select
import os
from uuid import uuid4
from google.cloud import storage 

from app.core.database import get_session
# --- IMPORTS DE SEGURIDAD ---
from app.core.deps import get_current_active_user
# IMPORTANTE: Importamos UserRole para validar correctamente los permisos
from app.models.users import User, UserRole

# Modelos
from app.models.design import (
    ProductMaster, ProductVersion, VersionComponent, VersionStatus
)
from app.models.material import Material 
from app.models.foundations import Client
from app.services.cloud_storage import upload_to_gcs

# Schemas
from app.schemas.design_schema import (
    ProductMasterCreate, ProductMasterRead,
    ProductVersionCreate, ProductVersionRead
)

router = APIRouter()

# -----------------------------------------------------------------------------
# CONSTANTES CLOUD
# -----------------------------------------------------------------------------
BUCKET_NAME = "valentina-erp-v3-assets" 

# ==========================================
# 1. GESTIÓN DE MAESTROS (Familia del Producto)
# ==========================================

@router.post("/masters", response_model=ProductMasterRead)
def create_product_master(
    master_in: ProductMasterCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user) # Seguridad Agregada
):
    """Crea una nueva familia de productos."""
    # Opcional: Podríamos validar rol aquí, pero por ahora lo dejamos abierto a usuarios activos
    master = ProductMaster.from_orm(master_in)
    session.add(master)
    session.commit()
    session.refresh(master)
    return master

@router.get("/masters", response_model=List[ProductMasterRead])
def read_product_masters(
    client_id: int | None = None,
    only_ready: bool = Query(False),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lista los diseños.
    Lógica de permisos:
    - VENTAS (SALES): Solo ve productos 'READY' (Listos para venta).
    - DIRECTOR, ADMIN, DISEÑO: Ven TODO (Borradores y Listos).
    """
    query = select(ProductMaster).where(ProductMaster.is_active == True)
    
    if client_id:
        query = query.where(ProductMaster.client_id == client_id)

    # --- CORRECCIÓN DE ROLES ---
    # Convertimos el rol del usuario a string seguro o comparamos con Enum
    # Si el usuario es VENTAS, filtramos.
    # Si es DIRECTOR, ADMIN o DESIGN, nos saltamos este if y mostramos todo.
    if current_user.role == UserRole.SALES or (hasattr(current_user.role, 'value') and current_user.role.value == "SALES") or only_ready:
        query = query.join(ProductVersion).where(
            ProductVersion.status == VersionStatus.READY
        ).distinct()
    
    masters = session.exec(query).all()
    return masters

@router.get("/masters/{master_id}", response_model=ProductMasterRead)
def read_product_master_detail(
    master_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Diseño no encontrado")
    return master

@router.put("/masters/{master_id}", response_model=ProductMasterRead)
def update_product_master(
    master_id: int,
    master_in: ProductMasterCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Actualiza un Maestro existente."""
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Diseño no encontrado")
    
    try:
        master_data = master_in.model_dump(exclude_unset=True)
    except AttributeError:
        master_data = master_in.dict(exclude_unset=True)

    for key, value in master_data.items():
        setattr(master, key, value)

    session.add(master)
    session.commit()
    session.refresh(master)
    return master

# === BORRADO EN CASCADA ===
@router.delete("/masters/{master_id}")
def delete_product_master(
    master_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Elimina un Producto Maestro, sus recetas y su plano en la Nube.
    """
    # Seguridad Extra: Solo Admin o Director pueden borrar (Opcional, pero recomendado)
    if current_user.role not in [UserRole.ADMIN, UserRole.DIRECTOR, UserRole.DESIGN]:
         raise HTTPException(status_code=403, detail="No tienes permisos para eliminar diseños")

    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Diseño no encontrado")
    
    # 1. Borrar archivo de Google Cloud
    if master.blueprint_path and "storage.googleapis.com" in master.blueprint_path:
        try:
            filename = master.blueprint_path.split("/")[-1]
            blob_name = f"blueprints/{filename}"
            storage_client = storage.Client()
            bucket = storage_client.bucket(BUCKET_NAME)
            blob = bucket.blob(blob_name)
            blob.delete()
        except Exception as e:
            print(f"Advertencia al borrar plano Cloud: {e}")

    # 2. Obtener y borrar versiones y componentes
    versions = session.exec(
        select(ProductVersion).where(ProductVersion.master_id == master_id)
    ).all()

    for version in versions:
        components = session.exec(
            select(VersionComponent).where(VersionComponent.version_id == version.id)
        ).all()
        for comp in components:
            session.delete(comp)
        session.delete(version)
    
    # 3. Eliminar Maestro
    session.delete(master)
    
    session.commit()
    return {"ok": True, "message": "Producto y archivos eliminados correctamente."}

# ==========================================
# 2. GESTIÓN DE VERSIONES (Recetas)
# ==========================================

@router.post("/versions", response_model=ProductVersionRead)
def create_product_version(
    version_in: ProductVersionCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    master = session.get(ProductMaster, version_in.master_id)
    if not master:
        raise HTTPException(status_code=404, detail="El Maestro de Producto no existe")

    # 1. Crear la cabecera de la nueva versión
    db_version = ProductVersion(
        master_id=version_in.master_id,
        version_name=version_in.version_name,
        status=version_in.status,
        is_active=version_in.is_active,
        estimated_cost=0.0
    )
    session.add(db_version)
    session.commit()
    session.refresh(db_version)

    total_estimated_cost = 0.0
    
    # 2. Lógica Condicional de Ingredientes
    if version_in.components:
        # Flujo A: El Frontend envió ingredientes específicos (comportamiento habitual)
        for comp_in in version_in.components:
            material = session.get(Material, comp_in.material_id)
            if material:
                raw_line_cost = comp_in.quantity * material.current_cost
                cost_line = math.ceil(raw_line_cost * 100) / 100
                total_estimated_cost += cost_line
                
                db_comp = VersionComponent(
                    version_id=db_version.id,
                    material_id=comp_in.material_id,
                    quantity=comp_in.quantity
                )
                session.add(db_comp)
    else:
        # Flujo B: Deep Copy de la Versión Original (ID más bajo del mismo Maestro)
        original_version = session.exec(
            select(ProductVersion)
            .where(ProductVersion.master_id == version_in.master_id)
            # Excluimos la que acabamos de crear (aunque lógicamente tiene el ID más alto)
            .where(ProductVersion.id != db_version.id) 
            .order_by(ProductVersion.id.asc())
        ).first()

        if original_version:
            original_components = session.exec(
                select(VersionComponent)
                .where(VersionComponent.version_id == original_version.id)
            ).all()

            for orig_comp in original_components:
                material = session.get(Material, orig_comp.material_id)
                if material:
                    # Siempre re-cotizamos con el costo actual del material
                    raw_line_cost = orig_comp.quantity * material.current_cost
                    cost_line = math.ceil(raw_line_cost * 100) / 100
                    total_estimated_cost += cost_line
                    
                    new_comp = VersionComponent(
                        version_id=db_version.id,
                        material_id=orig_comp.material_id,
                        quantity=orig_comp.quantity
                    )
                    session.add(new_comp)

    # 3. Consolidar el costo y cerrar la transacción
    db_version.estimated_cost = round(total_estimated_cost, 2)
    session.add(db_version)
    session.commit()
    session.refresh(db_version)
    
    return db_version

@router.put("/versions/{version_id}", response_model=ProductVersionRead)
def update_product_version(
    version_id: int,
    version_in: ProductVersionCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    db_version = session.get(ProductVersion, version_id)
    if not db_version:
        raise HTTPException(status_code=404, detail="Versión no encontrada")

    db_version.version_name = version_in.version_name
    db_version.status = version_in.status
    
    existing_comps = session.exec(
        select(VersionComponent).where(VersionComponent.version_id == version_id)
    ).all()
    for comp in existing_comps:
        session.delete(comp)
    
    total_estimated_cost = 0.0
    
    for comp_in in version_in.components:
        if comp_in.quantity > 0:
            material = session.get(Material, comp_in.material_id)
            if not material:
                continue 

            raw_line_cost = comp_in.quantity * material.current_cost
            cost_line = math.ceil(raw_line_cost * 100) / 100
            total_estimated_cost += cost_line

            new_comp = VersionComponent(
                version_id=db_version.id,
                material_id=comp_in.material_id,
                quantity=comp_in.quantity
            )
            session.add(new_comp)

    db_version.estimated_cost = round(total_estimated_cost, 2)
    session.add(db_version)
    
    session.commit()
    session.refresh(db_version)
    return db_version

@router.get("/versions/{version_id}", response_model=ProductVersionRead)
def read_version_detail(
    version_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    version = session.get(ProductVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    return version

@router.patch("/versions/{version_id}/status", response_model=ProductVersionRead)
def update_version_status(
    version_id: int,
    status: VersionStatus,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    version = session.get(ProductVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    
    version.status = status
    session.add(version)
    session.commit()
    session.refresh(version)
    return version

@router.patch("/versions/{version_id}/rename", response_model=ProductVersionRead)
def rename_product_version(
    version_id: int,
    new_name: str = Query(..., min_length=1),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """Renombra una versión específica sin afectar sus ingredientes."""
    version = session.get(ProductVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    
    version.version_name = new_name
    session.add(version)
    session.commit()
    session.refresh(version)
    return version

@router.delete("/versions/{version_id}")
def delete_product_version(
    version_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Elimina una versión específica y sus ingredientes en cascada.
    NO afecta al Producto Maestro ni a otras versiones existentes.
    """
    # 1. Buscar la versión específica
    version = session.get(ProductVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    
    # 2. Borrar la versión.
    # Nota: SQLAlchemy automáticamente borrará los VersionComponent asociados 
    # gracias a sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    session.delete(version)
    session.commit()
    
    return {"ok": True, "message": "Versión y sus ingredientes eliminados correctamente."}

# ==========================================
# 3. GESTIÓN DE CATEGORÍAS
# ==========================================

@router.put("/products/categories/rename")
def rename_product_category(
    *,
    session: Session = Depends(get_session),
    old_name: str = Query(..., min_length=1),
    new_name: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_active_user)
):
    products = session.exec(
        select(ProductMaster).where(ProductMaster.category == old_name)
    ).all()
    
    if not products:
        return {"message": f"No se encontraron productos", "updated_count": 0}
    
    count = 0
    for product in products:
        product.category = new_name
        session.add(product)
        count += 1
        
    session.commit()
    return {"message": "Categoría corregida", "updated_products": count}

# ==========================================
# 8. SUBIR PLANO / IMAGEN AL MASTER (NUBE) - VERSIÓN CORREGIDA
# ==========================================
@router.post("/masters/{master_id}/blueprint")
async def upload_master_blueprint(
    master_id: int,
    blueprint: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Sube un plano (PDF) o imagen al producto maestro.
    Usa la tubería centralizada 'upload_to_gcs'.
    """
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # 1. Definir nombre del archivo
    # Usamos uuid para evitar colisiones
    file_extension = blueprint.filename.split(".")[-1]
    filename = f"{master_id}_{uuid4().hex[:6]}.{file_extension}"
    blob_name = f"blueprints/{filename}"

    # 2. Subir usando nuestra herramienta BLINDADA
    # Aquí pasamos explícitamente el content_type para que acepte PDF y JPG
    public_url = upload_to_gcs(blueprint.file, blob_name, content_type=blueprint.content_type)

    if not public_url:
        raise HTTPException(status_code=500, detail="Error al subir el archivo a Google Cloud")
    
    # 3. Guardar la URL en la base de datos
    master.blueprint_path = public_url
    session.add(master)
    session.commit()
    session.refresh(master)

    return {"message": "Archivo subido correctamente", "path": public_url}

@router.delete("/masters/{master_id}/blueprint")
def delete_master_blueprint(
    master_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # Nota: Por seguridad, solo borramos la referencia en la BD.
    # El archivo en la nube se puede quedar como histórico o borrarse manualmente.
    # Si quieres borrarlo de la nube, necesitaríamos una función 'delete_from_gcs' en el futuro.
    
    master.blueprint_path = None
    session.add(master)
    session.commit()
    session.refresh(master)

    return {"message": "Referencia al plano eliminada correctamente"}


