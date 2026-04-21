from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import or_
from sqlmodel import Session, select

# Asumiendo que tu dependencia de base de datos está en app.api.deps o app.db.session
# Ajusta esta importación si tu get_db está en otro lado
from app.core.deps import get_session

from app.models.production import ProductionBatch, ProductionBatchStatus
from app.models.foundations import Client
from app.models.sales import SalesOrderItemInstance, SalesOrderItem, SalesOrder, PaymentStatus, InstanceStatus
from app.models.inventory import InventoryReservation
from app.models.design import VersionComponent
from app.models.material import Material

router = APIRouter()
# --- SCHEMAS DE RESPUESTA EXTENDIDOS (V3.5) ---
class InstanceDetail(BaseModel):
    id: int
    custom_name: str
    production_status: str
    qr_code: Optional[str] = None
    order_folio: Optional[str] = None
    client_name: Optional[str] = None
    project_name: Optional[str] = None

class ProductionBatchResponse(BaseModel):
    id: int
    folio: str
    batch_type: str
    status: str
    estimated_merma_percent: float
    is_payment_cleared: bool
    instances: List[InstanceDetail] = []


class RequestLabelsBody(BaseModel):
    mdf_bundles: int
    hardware_bundles: int


class RequestLabelsResponse(BaseModel):
    instance_id: int
    mdf_bundles: int
    hardware_bundles: int
    total_bundles: int


@router.post("/instances/{instance_id}/request_labels", response_model=RequestLabelsResponse)
def request_labels(
    instance_id: int,
    body: RequestLabelsBody,
    db: Session = Depends(get_session),
):
    """Registra bultos declarados para solicitud de etiquetas (empaque)."""
    if body.mdf_bundles < 1 or body.hardware_bundles < 1:
        raise HTTPException(
            status_code=400,
            detail="mdf_bundles y hardware_bundles deben ser al menos 1.",
        )

    instance = db.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")

    total_bundles = body.mdf_bundles + body.hardware_bundles
    instance.mdf_bundles = body.mdf_bundles
    instance.hardware_bundles = body.hardware_bundles
    instance.declared_bundles = body.mdf_bundles + body.hardware_bundles
    db.add(instance)
    db.commit()
    db.refresh(instance)

    return RequestLabelsResponse(
        instance_id=instance.id,
        mdf_bundles=body.mdf_bundles,
        hardware_bundles=body.hardware_bundles,
        total_bundles=total_bundles,
    )


def _generate_folio(db: Session, batch_type: str) -> str:
    """
    Genera el siguiente folio secuencial para un lote.
    Formato: LOTE-MDF-0001, LOTE-MDF-0002, LOTE-PIEDRA-0001...
    Busca el último folio del mismo tipo y suma 1.
    """
    prefix = f"LOTE-{batch_type.upper()}-"
    existing = db.exec(
        select(ProductionBatch)
        .where(ProductionBatch.folio.startswith(prefix))
        .order_by(ProductionBatch.id.desc())
    ).all()

    if not existing:
        return f"{prefix}0001"

    # Extraer el número del último folio y sumar 1
    last_folio = existing[0].folio
    try:
        last_num = int(last_folio.replace(prefix, ""))
        next_num = last_num + 1
    except ValueError:
        next_num = len(existing) + 1

    return f"{prefix}{str(next_num).zfill(4)}"


@router.post("/", response_model=ProductionBatch, status_code=status.HTTP_201_CREATED)
def create_production_batch(
    *,
    db: Session = Depends(get_session),
    batch_type: str,
    estimated_merma_percent: float = 0.0
):
    """
    Crea un nuevo Lote de Producción con folio secuencial automático.
    El folio ya no se recibe del frontend — se genera en el backend.
    """
    folio = _generate_folio(db, batch_type)

    new_batch = ProductionBatch(
        folio=folio,
        batch_type=batch_type,
        estimated_merma_percent=estimated_merma_percent,
        status=ProductionBatchStatus.DRAFT
    )
    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)
    return new_batch


@router.get("/", response_model=List[ProductionBatchResponse])
def read_batches(db: Session = Depends(get_session)):
    batches = db.exec(
        select(ProductionBatch)
        .order_by(ProductionBatch.id.asc())
    ).all()
    result = []
    
    for batch in batches:
        # 1. Obtener instancias (bultos) asignadas a este lote
        # Buscar instancias según tipo de lote
        if batch.batch_type.upper() == "PIEDRA":
            instances = db.exec(
                select(SalesOrderItemInstance)
                .where(SalesOrderItemInstance.stone_batch_id == batch.id)
            ).all()
        else:
            instances = db.exec(
                select(SalesOrderItemInstance)
                .where(SalesOrderItemInstance.production_batch_id == batch.id)
            ).all()
        
        # 2. Lógica Financiera: Buscar si hay adeudos en las órdenes vinculadas
        is_payment_cleared = True
        if not instances:
            # Regla: Un lote sin instancias no se puede enviar a producción
            is_payment_cleared = False 
        else:
            for inst in instances:
                # Subir en la jerarquía: Instancia -> Item -> Orden
                item = db.exec(select(SalesOrderItem).where(SalesOrderItem.id == inst.sales_order_item_id)).first()
                if item:
                    order = db.exec(select(SalesOrder).where(SalesOrder.id == item.sales_order_id)).first()
                    # Si el anticipo no ha sido cubierto (PENDING), bloqueamos el lote
                    if order and order.payment_status == PaymentStatus.PENDING:
                        is_payment_cleared = False
                        break 
        
        # 3. Construir el objeto de respuesta
        batch_data = batch.model_dump()
        batch_data["is_payment_cleared"] = is_payment_cleared
        enriched_instances = []
        for i in instances:
            order_folio = None
            client_name = None
            project_name = None

            item = db.exec(
                select(SalesOrderItem)
                .where(SalesOrderItem.id == i.sales_order_item_id)
            ).first()

            if item:
                order = db.exec(
                    select(SalesOrder)
                    .where(SalesOrder.id == item.sales_order_id)
                ).first()
                if order:
                    order_folio = f"OV-{str(order.id).zfill(4)}"
                    project_name = order.project_name
                    if order.client_id:
                        client = db.exec(
                            select(Client)
                            .where(Client.id == order.client_id)
                        ).first()
                        if client:
                            client_name = client.full_name

            enriched_instances.append(InstanceDetail(
                id=i.id,
                custom_name=i.custom_name,
                production_status=(
                    i.production_status.value
                    if hasattr(i.production_status, 'value')
                    else i.production_status
                ),
                qr_code=i.qr_code,
                order_folio=order_folio,
                client_name=client_name,
                project_name=project_name,
            ))

        batch_data["instances"] = enriched_instances
        result.append(batch_data)
        
    return result


@router.post("/{batch_id}/assign_instance/{instance_id}")
def assign_instance_to_batch(
    *,
    db: Session = Depends(get_session),
    batch_id: int,
    instance_id: int
):
    """
    CANDADO RTM: Asigna una instancia (bultos) a un Lote de Producción.
    Aquí validamos que la instancia sea apta para fabricarse.
    """
    # 1. Buscar Lote
    batch = db.get(ProductionBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Lote de producción no encontrado.")
    
    # 2. Buscar Instancia
    instance = db.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")

    # ---------------------------------------------------------
    # 🛡️ REGLAS DEL CANDADO RTM (Release To Manufacturing) 🛡️
    # ---------------------------------------------------------
    
    # Regla A: No procesar nada cancelado
    if instance.is_cancelled:
        raise HTTPException(
            status_code=400, 
            detail="CANDADO RTM: Esta instancia está cancelada. No puede pasar a producción."
        )
    
    # Regla B: Verificar que el lote correspondiente no esté asignado
    if batch.batch_type.upper() == "PIEDRA":
        if instance.stone_batch_id is not None:
            raise HTTPException(
                status_code=400,
                detail=f"CANDADO RTM: Esta instancia ya tiene un "
                       f"Lote Piedra asignado "
                       f"(stone_batch_id={instance.stone_batch_id})."
            )
    else:  # MDF u otros
        if instance.production_batch_id is not None:
            raise HTTPException(
                status_code=400,
                detail=f"CANDADO RTM: Esta instancia ya tiene un "
                       f"Lote MDF asignado "
                       f"(production_batch_id={instance.production_batch_id})."
            )
        
    # (Futuro) Regla C: Aquí podríamos cruzar con Tesorería para ver si la orden de venta tiene anticipo pagado.

    # ---------------------------------------------------------

    # Si pasa los candados, asignamos la llave foránea y cambiamos el estatus
    if batch.batch_type.upper() == "PIEDRA":
        instance.stone_batch_id = batch.id
    else:
        instance.production_batch_id = batch.id
    instance.production_status = InstanceStatus.IN_PRODUCTION
    
    db.add(instance)

    # Leer BOM de la instancia para comprometer material
    item = db.exec(
        select(SalesOrderItem)
        .where(SalesOrderItem.id == instance.sales_order_item_id)
    ).first()

    if item and item.origin_version_id:
        components = db.exec(
            select(VersionComponent)
            .where(VersionComponent.version_id == item.origin_version_id)
        ).all()

        # Categorías inventariables según tipo de lote
        if batch.batch_type.upper() == "MDF":
            skip_categories = {"PROCESO", "PIEDRA"}
        elif batch.batch_type.upper() == "PIEDRA":
            skip_categories = {
                "PROCESO", "TABLERO", "HERRAJES",
                "CHAPACINTA", "ACCESORIO", "ELECTRICIDAD",
                "ELECTRODOMÉSTICO", "ESPECIAL",
                "INSUMOS", "VIDRIO",
            }
        else:
            skip_categories = {"PROCESO"}

        for comp in components:
            material = db.get(Material, comp.material_id)
            if material and (material.category or "").upper() in skip_categories:
                continue

            reservation = InventoryReservation(
                production_batch_id=batch.id,
                instance_id=instance.id,
                material_id=comp.material_id,
                quantity_reserved=comp.quantity,
                status="ACTIVA",
            )
            db.add(reservation)

            if material:
                material.committed_stock = (
                    material.committed_stock or 0.0
                ) + comp.quantity
                db.add(material)

    db.commit()
    db.refresh(instance)
    
    return {"message": "Instancia asignada exitosamente al lote", "instance": instance}

@router.patch("/{batch_id}/status")
def update_batch_status(batch_id: int, status: str, db: Session = Depends(get_session)):
    # 1. Buscar el lote
    batch = db.exec(select(ProductionBatch).where(ProductionBatch.id == batch_id)).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    
    # 2. Actualizar el estatus del lote
    try:
        new_status = ProductionBatchStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Estado de lote no válido")

    batch.status = new_status
    db.add(batch)
    
    # 3. Sincronizar instancias solo en IN_PRODUCTION / READY_TO_INSTALL.
    #    PACKING solo cambia el lote; las instancias siguen IN_PRODUCTION.
    if new_status in (
        ProductionBatchStatus.IN_PRODUCTION,
        ProductionBatchStatus.READY_TO_INSTALL,
    ):
        instances = db.exec(
            select(SalesOrderItemInstance)
            .where(SalesOrderItemInstance.production_batch_id == batch_id)
        ).all()

        if new_status == ProductionBatchStatus.IN_PRODUCTION:
            for inst in instances:
                inst.production_status = InstanceStatus.IN_PRODUCTION
                db.add(inst)
        else:  # READY_TO_INSTALL
            for inst in instances:
                inst.production_status = InstanceStatus.READY
                db.add(inst)

    # 4. Guardar cambios en la base de datos
    db.commit()
    db.refresh(batch)
    
    return batch


@router.delete("/{batch_id}", status_code=200)
def delete_production_batch(
    batch_id: int,
    db: Session = Depends(get_session),
):
    """
    BOTÓN DE ALTO — Solo disponible si el lote está en DRAFT.
    1. Regresa todas las instancias a PENDING
    2. Cancela reservas ACTIVA → libera committed_stock
    3. Elimina el lote
    """
    batch = db.get(ProductionBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")

    if batch.status != ProductionBatchStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail=f"Solo se pueden eliminar lotes en DRAFT. "
                   f"Estado actual: {batch.status}"
        )

    folio = batch.folio

    # 1. Regresar instancias a PENDING
    if batch.batch_type.upper() == "PIEDRA":
        instances = db.exec(
            select(SalesOrderItemInstance)
            .where(SalesOrderItemInstance.stone_batch_id == batch_id)
        ).all()
    else:
        instances = db.exec(
            select(SalesOrderItemInstance)
            .where(SalesOrderItemInstance.production_batch_id == batch_id)
        ).all()

    for inst in instances:
        inst.production_status = InstanceStatus.PENDING
        # Limpiar el campo correcto según tipo de lote
        if batch.batch_type.upper() == "PIEDRA":
            inst.stone_batch_id = None
        else:
            inst.production_batch_id = None
        db.add(inst)

    # 2. Cancelar reservas y liberar committed_stock
    reservations = db.exec(
        select(InventoryReservation)
        .where(InventoryReservation.production_batch_id == batch_id)
        .where(InventoryReservation.status == "ACTIVA")
    ).all()

    for res in reservations:
        res.status = "CANCELADA"
        db.add(res)

        material = db.get(Material, res.material_id)
        if material:
            material.committed_stock = max(
                0.0,
                (material.committed_stock or 0.0) - res.quantity_reserved
            )
            db.add(material)
        db.delete(res)

    # 3. Eliminar el lote
    db.delete(batch)
    db.commit()

    return {
        "message": f"Lote {folio} eliminado. "
                   f"{len(instances)} instancia(s) regresadas a PENDING. "
                   f"{len(reservations)} reserva(s) canceladas.",
        "instances_reset": len(instances),
        "reservations_cancelled": len(reservations),
    }


class DeclareStonePiecesBody(BaseModel):
    stone_pieces: int


@router.patch("/instances/{instance_id}/stone_pieces")
def declare_stone_pieces(
    instance_id: int,
    body: DeclareStonePiecesBody,
    db: Session = Depends(get_session),
):
    """Producción declara el número de piezas de piedra de una instancia."""
    if body.stone_pieces < 1:
        raise HTTPException(
            status_code=400,
            detail="El número de piezas debe ser al menos 1.",
        )
    instance = db.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")

    instance.stone_pieces = body.stone_pieces
    db.add(instance)
    db.commit()
    db.refresh(instance)

    return {
        "instance_id": instance.id,
        "instance_name": instance.custom_name,
        "stone_pieces": instance.stone_pieces,
    }