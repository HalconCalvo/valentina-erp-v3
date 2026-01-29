from typing import List, Any
import math
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlmodel import Session, select
import os
import shutil
from uuid import uuid4

from app.core.database import get_session
# --- IMPORTS DE SEGURIDAD ---
from app.core.deps import get_current_active_user
from app.models.users import User

# Modelos
from app.models.design import (
    ProductMaster, ProductVersion, VersionComponent, VersionStatus
)
from app.models.material import Material 
from app.models.foundations import Client 

# Schemas
from app.schemas.design_schema import (
    ProductMasterCreate, ProductMasterRead,
    ProductVersionCreate, ProductVersionRead
)

router = APIRouter()

# ==========================================
# 1. GESTIÓN DE MAESTROS (Familia del Producto)
# ==========================================

@router.post("/masters", response_model=ProductMasterRead)
def create_product_master(
    master_in: ProductMasterCreate,
    session: Session = Depends(get_session)
):
    """Crea una nueva familia de productos."""
    master = ProductMaster.from_orm(master_in)
    session.add(master)
    session.commit()
    session.refresh(master)
    return master

@router.get("/masters", response_model=List[ProductMasterRead])
def read_product_masters(
    client_id: int | None = None,
    # --- NUEVO PARÁMETRO: Permite forzar el filtro desde el Frontend ---
    only_ready: bool = Query(False),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lista los diseños.
    - Si el usuario es 'SALES' -> Automáticamente solo ve READY.
    - Si se envía ?only_ready=true -> Fuerza filtro READY (para Admin en modo Ventas).
    """
    
    query = select(ProductMaster).where(ProductMaster.is_active == True)
    
    if client_id:
        query = query.where(ProductMaster.client_id == client_id)

    # --- LÓGICA DE FILTRADO COMBINADA ---
    # Se activa si es Vendedor O si el Frontend lo pide explícitamente
    if current_user.role == "SALES" or only_ready:
        query = query.join(ProductVersion).where(
            ProductVersion.status == VersionStatus.READY
        ).distinct()
    
    masters = session.exec(query).all()
    return masters

@router.get("/masters/{master_id}", response_model=ProductMasterRead)
def read_product_master_detail(
    master_id: int,
    session: Session = Depends(get_session)
):
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Diseño no encontrado")
    return master

@router.put("/masters/{master_id}", response_model=ProductMasterRead)
def update_product_master(
    master_id: int,
    master_in: ProductMasterCreate, 
    session: Session = Depends(get_session)
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
    session: Session = Depends(get_session)
):
    """
    Elimina un Producto Maestro, sus recetas y su plano físico.
    """
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Diseño no encontrado")
    
    # 1. Borrar archivo físico si existe (Limpieza)
    if master.blueprint_path:
        base_static = os.path.join(os.getcwd(), "static")
        full_path = os.path.join(base_static, master.blueprint_path)
        if os.path.exists(full_path):
            try:
                os.remove(full_path)
            except Exception:
                pass 

    # 2. Obtener versiones
    versions = session.exec(
        select(ProductVersion).where(ProductVersion.master_id == master_id)
    ).all()

    for version in versions:
        # 3. Eliminar componentes
        components = session.exec(
            select(VersionComponent).where(VersionComponent.version_id == version.id)
        ).all()
        for comp in components:
            session.delete(comp)
        
        # 4. Eliminar versión
        session.delete(version)
    
    # 5. Eliminar Maestro
    session.delete(master)
    
    session.commit()
    return {"ok": True, "message": "Producto y archivos eliminados correctamente."}

# ==========================================
# 2. GESTIÓN DE VERSIONES (Recetas)
# ==========================================

@router.post("/versions", response_model=ProductVersionRead)
def create_product_version(
    version_in: ProductVersionCreate,
    session: Session = Depends(get_session)
):
    master = session.get(ProductMaster, version_in.master_id)
    if not master:
        raise HTTPException(status_code=404, detail="El Maestro de Producto no existe")

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
    if version_in.components:
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

    db_version.estimated_cost = round(total_estimated_cost, 2)
    session.add(db_version)
    session.commit()
    session.refresh(db_version)
    
    return db_version

@router.put("/versions/{version_id}", response_model=ProductVersionRead)
def update_product_version(
    version_id: int,
    version_in: ProductVersionCreate, 
    session: Session = Depends(get_session)
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
    session: Session = Depends(get_session)
):
    version = session.get(ProductVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    return version

@router.patch("/versions/{version_id}/status", response_model=ProductVersionRead)
def update_version_status(
    version_id: int,
    status: VersionStatus,
    session: Session = Depends(get_session)
):
    version = session.get(ProductVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    
    version.status = status
    session.add(version)
    session.commit()
    session.refresh(version)
    return version

# ==========================================
# 3. GESTIÓN DE CATEGORÍAS
# ==========================================

@router.put("/products/categories/rename")
def rename_product_category(
    *,
    session: Session = Depends(get_session),
    old_name: str = Query(..., min_length=1),
    new_name: str = Query(..., min_length=1)
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
# 8. SUBIR PLANO / IMAGEN AL MASTER
# ==========================================
@router.post("/masters/{master_id}/blueprint")
def upload_master_blueprint(
    master_id: int,
    blueprint: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    base_dir = os.getcwd() 
    upload_dir = os.path.join(base_dir, "static", "uploads", "blueprints")
    os.makedirs(upload_dir, exist_ok=True)

    if master.blueprint_path:
        old_file_path = os.path.join(base_dir, "static", master.blueprint_path)
        if os.path.exists(old_file_path):
            try:
                os.remove(old_file_path)
            except Exception:
                pass 

    file_extension = blueprint.filename.split(".")[-1]
    new_filename = f"{master_id}_{uuid4().hex[:6]}.{file_extension}"
    file_path = os.path.join(upload_dir, new_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(blueprint.file, buffer)

    relative_path = f"uploads/blueprints/{new_filename}"
    
    master.blueprint_path = relative_path
    session.add(master)
    session.commit()
    session.refresh(master)

    return {"message": "Plano subido correctamente", "path": relative_path}

@router.delete("/masters/{master_id}/blueprint")
def delete_master_blueprint(
    master_id: int,
    session: Session = Depends(get_session)
):
    """Elimina el archivo de plano asociado a un producto."""
    master = session.get(ProductMaster, master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if master.blueprint_path:
        # Construir ruta absoluta
        base_dir = os.getcwd()
        full_path = os.path.join(base_dir, "static", master.blueprint_path)
        
        # Eliminar archivo físico
        if os.path.exists(full_path):
            try:
                os.remove(full_path)
            except Exception as e:
                print(f"Error borrando archivo: {e}")

        # Limpiar referencia en BD
        master.blueprint_path = None
        session.add(master)
        session.commit()
        session.refresh(master)

    return {"message": "Plano eliminado correctamente"}