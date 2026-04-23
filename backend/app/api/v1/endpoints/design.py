from typing import List, Any, Dict, Optional
import math
import time
import uuid as uuid_lib
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import or_
from sqlmodel import Session, select
import os
from uuid import uuid4
from google.cloud import storage 
from pydantic import BaseModel

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
from app.models.production import ProductionBatch, ProductionBatchStatus
from app.models.sales import (
    InstanceStatus,
    SalesOrder,
    SalesOrderItemInstance,
    SalesOrderItem,
)
from app.services.cloud_storage import upload_to_gcs
from app.services.label_printer import generate_all_labels, concatenate_zpl
from app.services.planning_service import compute_semaphore
from datetime import datetime

# Schemas
from app.schemas.design_schema import (
    ProductMasterCreate, ProductMasterRead,
    ProductVersionCreate, ProductVersionRead
)

router = APIRouter()

# -----------------------------------------------------------------------------
# CONSTANTES CLOUD Y NEGOCIO
# -----------------------------------------------------------------------------
BUCKET_NAME = "valentina-erp-v3-assets" 

# Categorías que tienen poder de bloqueo según el proceso de fabricación
CRITICAL_CATEGORIES_MDF = ["MDF", "TABLERO", "MELAMINA", "MADERA", "ENCHAPADO"]
CRITICAL_CATEGORIES_PIEDRA = ["PIEDRA", "GRANITO", "CUARZO", "MARMOL", "SUPERFICIE"]

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

MDF_CATEGORIES = {"TABLERO"}
STONE_CATEGORIES = {"PIEDRA"}


def _update_version_flags(
    version: ProductVersion,
    components: list,
    session: Session,
) -> None:
    """
    Calcula y actualiza has_mdf_components y has_stone_components
    según los materiales de la receta. Se llama al crear o editar.
    """
    has_mdf = False
    has_stone = False
    for comp in components:
        material = session.get(Material, comp.material_id)
        if not material:
            continue
        cat = (material.category or "").upper()
        if cat in MDF_CATEGORIES:
            has_mdf = True
        if cat in STONE_CATEGORIES:
            has_stone = True
        if has_mdf and has_stone:
            break
    version.has_mdf_components = has_mdf
    version.has_stone_components = has_stone


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
    all_comps = session.exec(
        select(VersionComponent)
        .where(VersionComponent.version_id == db_version.id)
    ).all()
    _update_version_flags(db_version, all_comps, session)
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
    all_comps = session.exec(
        select(VersionComponent)
        .where(VersionComponent.version_id == db_version.id)
    ).all()
    _update_version_flags(db_version, all_comps, session)
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

# ==========================================
# 9. SIMULADOR Y LOTIFICACIÓN (V3.5)
# ==========================================

# --- SCHEMAS DEL SIMULADOR ---
class SimulateBatchRequest(BaseModel):
    instance_ids: List[int]
    batch_type: str  # "MDF" o "PIEDRA"

class SimulatedMaterial(BaseModel):
    material_id: int
    sku: str
    name: str
    category: str
    required_qty: float
    available_qty: float
    is_blocking: bool
    status_color: str  # "RED", "YELLOW", "GREEN"

class SimulateBatchResponse(BaseModel):
    suggested_status: str  # "DRAFT" (Pasa a Fábrica) o "ON_HOLD" (Frenado)
    materials: List[SimulatedMaterial]

@router.post("/simulate_batch", response_model=SimulateBatchResponse)
def simulate_batch(
    request: SimulateBatchRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Motor principal para simular la factibilidad de un lote según existencias físicas.
    Cruza la lista de materiales (BOM) contra inventario físico, ignorando escasez 
    de otros procesos (MDF vs Piedra).
    """
    if not request.instance_ids:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos una instancia.")

    if request.batch_type.upper() == "PIEDRA":
        raise HTTPException(
            status_code=400,
            detail="El Simulador solo aplica para lotes MDF. "
                   "Los lotes de Piedra se crean directamente."
        )

    # 1. Diccionario para acumular las cantidades requeridas
    # Formato: { material_id: required_qty }
    aggregated_bom: Dict[int, float] = {}

    # 2. Rastrear instancias y sumar recetas
    for instance_id in request.instance_ids:
        instance = session.exec(select(SalesOrderItemInstance).where(SalesOrderItemInstance.id == instance_id)).first()
        if not instance:
            continue
            
        item = session.exec(select(SalesOrderItem).where(SalesOrderItem.id == instance.sales_order_item_id)).first()
        if not item or not item.origin_version_id:
            continue

        components = session.exec(
            select(VersionComponent).where(VersionComponent.version_id == item.origin_version_id)
        ).all()

        for comp in components:
            material = session.exec(
                select(Material).where(Material.id == comp.material_id)
            ).first()
            # Saltar PROCESO (no inventariable) y PIEDRA en simulador MDF
            if material and (material.category or "").upper() in ("PROCESO", "PIEDRA"):
                continue
            if comp.material_id in aggregated_bom:
                aggregated_bom[comp.material_id] += comp.quantity
            else:
                aggregated_bom[comp.material_id] = comp.quantity

    # 3. Cruzar la suma total contra Inventario Físico
    simulated_materials = []
    batch_is_blocked = False

    for mat_id, req_qty in aggregated_bom.items():
        material = session.exec(select(Material).where(Material.id == mat_id)).first()
        if not material:
            continue

        available_qty = material.physical_stock - material.committed_stock
        is_shortage = req_qty > available_qty
        
        is_blocking = False
        status_color = "GREEN"

        if is_shortage:
            cat_upper = material.category.upper()
            
            # Aplicar Regla de Oro: Dependencia estricta solo para categorías núcleo del lote
            if request.batch_type == "MDF" and any(c in cat_upper for c in CRITICAL_CATEGORIES_MDF):
                is_blocking = True
                batch_is_blocked = True
                status_color = "RED"
            elif request.batch_type == "PIEDRA" and any(c in cat_upper for c in CRITICAL_CATEGORIES_PIEDRA):
                is_blocking = True
                batch_is_blocked = True
                status_color = "RED"
            else:
                status_color = "YELLOW" # Falta, pero permitimos negativos

        simulated_materials.append(
            SimulatedMaterial(
                material_id=material.id,
                sku=material.sku,
                name=material.name,
                category=material.category,
                required_qty=round(req_qty, 2),
                available_qty=round(available_qty, 2),
                is_blocking=is_blocking,
                status_color=status_color
            )
        )

    suggested_status = (
        ProductionBatchStatus.ON_HOLD.value
        if batch_is_blocked
        else ProductionBatchStatus.DRAFT.value
    )

    return SimulateBatchResponse(
        suggested_status=suggested_status,
        materials=simulated_materials
    )

# ==========================================
# 10. RADAR DE INSTANCIAS PENDIENTES (SIMULADOR)
# ==========================================
from app.models.sales import PaymentStatus, SalesOrderStatus as _SOStatus

class PendingInstanceResponse(BaseModel):
    id: int
    custom_name: str
    product_name: str
    order_project_name: str
    order_id: int
    client_name: Optional[str] = None
    semaphore: Optional[str] = None
    schedule: Optional[dict] = None

# Órdenes confirmadas = tienen anticipo pagado O su status ya avanzó a producción
_CONFIRMED_ORDER_STATUSES = {
    _SOStatus.WAITING_ADVANCE,
    _SOStatus.SOLD,
    _SOStatus.IN_PRODUCTION,
    _SOStatus.FINISHED,
    _SOStatus.COMPLETED,
}

@router.get("/pending_instances", response_model=List[PendingInstanceResponse])
def get_pending_instances(
    batch_type: str = "MDF",
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Instancias sin lote asignado cuya OV está confirmada.
    Regla ampliada: incluye OVs con anticipo pagado (PARTIAL/PAID)
    O cuyo estatus de orden ya es WAITING_ADVANCE/SOLD/IN_PRODUCTION.
    """
    if batch_type.upper() == "PIEDRA":
        instances = session.exec(
            select(SalesOrderItemInstance)
            .where(SalesOrderItemInstance.stone_batch_id == None)
            .where(SalesOrderItemInstance.is_cancelled == False)
        ).all()
    else:
        instances = session.exec(
            select(SalesOrderItemInstance)
            .where(SalesOrderItemInstance.production_batch_id == None)
            .where(SalesOrderItemInstance.is_cancelled == False)
        ).all()

    result = []
    for inst in instances:
        item = session.exec(
            select(SalesOrderItem).where(SalesOrderItem.id == inst.sales_order_item_id)
        ).first()
        if not item:
            continue
        order = session.exec(
            select(SalesOrder).where(SalesOrder.id == item.sales_order_id)
        ).first()
        if not order:
            continue

        is_paid = order.payment_status in [PaymentStatus.PARTIAL, PaymentStatus.PAID]
        is_confirmed_status = order.status in _CONFIRMED_ORDER_STATUSES

        if not (is_paid or is_confirmed_status):
            continue

        version = (
            session.get(ProductVersion, item.origin_version_id)
            if item.origin_version_id
            else None
        )

        if batch_type.upper() == "PIEDRA":
            if version and not version.has_stone_components:
                continue
        else:
            if version and not version.has_mdf_components:
                continue

        # Obtener nombre del cliente
        client_name = None
        if order and order.client_id:
            client = session.get(Client, order.client_id)
            if client:
                client_name = client.full_name

        result.append(PendingInstanceResponse(
            id=inst.id,
            custom_name=inst.custom_name,
            product_name=item.product_name,
            order_project_name=order.project_name,
            order_id=order.id,
            client_name=client_name,
            semaphore=compute_semaphore(inst, datetime.utcnow(), session=session),
            schedule={
                "PM": inst.scheduled_prod_mdf.isoformat() if inst.scheduled_prod_mdf else None,
                "PP": inst.scheduled_prod_stone.isoformat() if inst.scheduled_prod_stone else None,
                "IM": inst.scheduled_inst_mdf.isoformat() if inst.scheduled_inst_mdf else None,
                "IP": inst.scheduled_inst_stone.isoformat() if inst.scheduled_inst_stone else None,
            },
        ))
    return result


# ==========================================
# 11. CENTRO DE IMPRESIÓN — SOLICITUDES DE ETIQUETAS
# ==========================================


class LabelRequestItem(BaseModel):
    instance_id: int
    custom_name: str
    client_name: str
    project_name: str
    declared_bundles: int
    is_stone: bool = False


@router.get("/label_requests", response_model=List[LabelRequestItem])
def list_label_requests(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Instancias con declared_bundles > 0 en producción activa (IN_PRODUCTION)
    o cuyo lote está en PACKING; enriquecidas con cliente y proyecto.
    """
    instances = session.exec(
        select(SalesOrderItemInstance)
        .outerjoin(ProductionBatch, SalesOrderItemInstance.production_batch_id == ProductionBatch.id)
        .where(
            or_(
                SalesOrderItemInstance.declared_bundles > 0,
                SalesOrderItemInstance.stone_pieces > 0,
            ),
            or_(
                SalesOrderItemInstance.production_status == InstanceStatus.IN_PRODUCTION,
                ProductionBatch.status == ProductionBatchStatus.PACKING,
            ),
        )
    ).all()

    result: List[LabelRequestItem] = []
    for inst in instances:
        item = session.exec(
            select(SalesOrderItem).where(SalesOrderItem.id == inst.sales_order_item_id)
        ).first()
        if not item:
            continue
        order = session.exec(
            select(SalesOrder).where(SalesOrder.id == item.sales_order_id)
        ).first()
        if not order:
            continue
        client = session.get(Client, order.client_id)
        is_stone = (inst.stone_pieces or 0) > 0
        result.append(
            LabelRequestItem(
                instance_id=inst.id,
                custom_name=inst.custom_name,
                client_name=client.full_name if client else "",
                project_name=order.project_name,
                declared_bundles=inst.declared_bundles or 0,
                is_stone=is_stone,
            )
        )
    return result


class GenerateLabelsResponse(BaseModel):
    instance_id: int
    instance_name: str
    client_name: str
    project_name: str
    total_labels: int
    mdf_bundles: int
    hardware_bundles: int
    zpl_content: str
    qr_uuid: str


@router.post(
    "/instances/{instance_id}/generate_labels",
    response_model=GenerateLabelsResponse,
)
def generate_labels(
    instance_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Genera el ZPL completo para todas las etiquetas de una instancia.
    Requiere que mdf_bundles y hardware_bundles estén declarados.
    """
    instance = session.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")

    if not instance.mdf_bundles and not instance.hardware_bundles:
        raise HTTPException(
            status_code=400,
            detail="Esta instancia no tiene bultos declarados. "
                   "Declara los bultos desde Producción primero.",
        )

    # Subir la cadena para obtener cliente y proyecto
    item = session.exec(
        select(SalesOrderItem)
        .where(SalesOrderItem.id == instance.sales_order_item_id)
    ).first()
    order = session.exec(
        select(SalesOrder)
        .where(SalesOrder.id == item.sales_order_id)
    ).first() if item else None
    client = session.get(Client, order.client_id) if order and order.client_id else None

    # Usar QR existente o generar uno nuevo
    qr_uuid = instance.qr_code or str(uuid_lib.uuid4())
    if not instance.qr_code:
        instance.qr_code = qr_uuid
        session.add(instance)
        session.commit()

    mdf = instance.mdf_bundles or 0
    hardware = instance.hardware_bundles or 0

    labels = generate_all_labels(
        client_name=client.full_name if client else "Sin cliente",
        project_name=order.project_name if order else "Sin proyecto",
        instance_name=instance.custom_name or f"Instancia #{instance_id}",
        mdf_bundles=mdf,
        hardware_bundles=hardware,
        qr_uuid=qr_uuid,
    )

    return GenerateLabelsResponse(
        instance_id=instance_id,
        instance_name=instance.custom_name or "",
        client_name=client.full_name if client else "",
        project_name=order.project_name if order else "",
        total_labels=len(labels),
        mdf_bundles=mdf,
        hardware_bundles=hardware,
        zpl_content=concatenate_zpl(labels),
        qr_uuid=qr_uuid,
    )


@router.get("/instances/{instance_id}/stone_manifest")
def generate_stone_manifest(
    instance_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Genera el PDF del Manifiesto de Viaje para piezas de Piedra.
    Requiere stone_pieces declarado y equipo instalador asignado.
    """
    from fastapi.responses import StreamingResponse
    from app.services.pdf_generator import PDFGenerator
    from app.models.production import InstallationAssignment
    from app.models.foundations import GlobalConfig

    instance = session.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")

    if not instance.stone_pieces:
        raise HTTPException(
            status_code=400,
            detail="Esta instancia no tiene piezas de piedra declaradas. "
                   "Declara las piezas desde Producción primero.",
        )

    # Subir cadena para obtener OV, cliente y proyecto
    item = session.exec(
        select(SalesOrderItem)
        .where(SalesOrderItem.id == instance.sales_order_item_id)
    ).first()
    order = session.exec(
        select(SalesOrder)
        .where(SalesOrder.id == item.sales_order_id)
    ).first() if item else None
    client = session.get(Client, order.client_id) if order and order.client_id else None
    order_folio = f"OV-{str(order.id).zfill(4)}" if order else "S/OV"

    # Obtener equipo instalador (asignación IP más reciente)
    assignment = session.exec(
        select(InstallationAssignment)
        .where(InstallationAssignment.instance_id == instance_id)
        .where(InstallationAssignment.lane == "IP")
        .order_by(InstallationAssignment.id.desc())
    ).first()

    leader_name = "Sin asignar"
    helper_1_name = None
    helper_2_name = None

    if assignment:
        leader = session.get(User, assignment.leader_user_id)
        leader_name = leader.full_name if leader else "Sin asignar"
        if assignment.helper_1_user_id:
            h1 = session.get(User, assignment.helper_1_user_id)
            helper_1_name = h1.full_name if h1 else None
        if assignment.helper_2_user_id:
            h2 = session.get(User, assignment.helper_2_user_id)
            helper_2_name = h2.full_name if h2 else None

    # Usar QR existente o generar uno
    qr_uuid = instance.qr_code or str(uuid_lib.uuid4())
    if not instance.qr_code:
        instance.qr_code = qr_uuid
        session.add(instance)
        session.commit()

    # Obtener config de empresa
    config = session.exec(select(GlobalConfig)).first()

    # Generar PDF
    generator = PDFGenerator()
    pdf_buffer = generator.generate_stone_manifest(
        instance_name=instance.custom_name or f"Instancia #{instance_id}",
        client_name=client.full_name if client else "Sin cliente",
        project_name=order.project_name if order else "Sin proyecto",
        order_folio=order_folio,
        stone_pieces=instance.stone_pieces,
        qr_uuid=qr_uuid,
        leader_name=leader_name,
        helper_1_name=helper_1_name,
        helper_2_name=helper_2_name,
        config=config,
    )

    filename = f"manifiesto_piedra_{instance_id}.pdf"
    pdf_buffer.seek(0)
    return StreamingResponse(
        iter([pdf_buffer.read()]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        },
    )