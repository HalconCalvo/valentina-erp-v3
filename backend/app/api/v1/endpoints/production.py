from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from sqlmodel import Session, select

# Asumiendo que tu dependencia de base de datos está en app.api.deps o app.db.session
# Ajusta esta importación si tu get_db está en otro lado
from app.core.deps import get_session

from app.models.production import ProductionBatch, ProductionBatchStatus
from app.models.sales import SalesOrderItemInstance, SalesOrderItem, SalesOrder, PaymentStatus, InstanceStatus

router = APIRouter()
# --- SCHEMAS DE RESPUESTA EXTENDIDOS (V3.5) ---
class InstanceDetail(BaseModel):
    id: int
    custom_name: str
    production_status: str
    qr_code: Optional[str] = None

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
    instance.declared_bundles = total_bundles
    db.add(instance)
    db.commit()
    db.refresh(instance)

    return RequestLabelsResponse(
        instance_id=instance.id,
        mdf_bundles=body.mdf_bundles,
        hardware_bundles=body.hardware_bundles,
        total_bundles=total_bundles,
    )


@router.post("/", response_model=ProductionBatch, status_code=status.HTTP_201_CREATED)
def create_production_batch(
    *,
    db: Session = Depends(get_session),
    folio: str,
    batch_type: str,
    estimated_merma_percent: float = 0.0
):
    """
    Crea un nuevo Lote de Producción (Borrador).
    """
    # Verificar que el folio no exista
    existing_batch = db.exec(select(ProductionBatch).where(ProductionBatch.folio == folio)).first()
    if existing_batch:
        raise HTTPException(
            status_code=400,
            detail="Ya existe un lote con este folio."
        )
    
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
    batches = db.exec(select(ProductionBatch)).all()
    result = []
    
    for batch in batches:
        # 1. Obtener instancias (bultos) asignadas a este lote
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
        batch_data["instances"] = [
            InstanceDetail(
                id=i.id, 
                custom_name=i.custom_name, 
                production_status=i.production_status.value if hasattr(i.production_status, 'value') else i.production_status,
                qr_code=i.qr_code
            ) for i in instances
        ]
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
    
    # Regla B: Solo instancias en estado PENDING pueden asignarse a un lote nuevo
    if instance.production_status != InstanceStatus.PENDING:
        raise HTTPException(
            status_code=400, 
            detail=f"CANDADO RTM: La instancia ya está en proceso o terminada (Estatus: {instance.production_status})."
        )
        
    # (Futuro) Regla C: Aquí podríamos cruzar con Tesorería para ver si la orden de venta tiene anticipo pagado.

    # ---------------------------------------------------------

    # Si pasa los candados, asignamos la llave foránea y cambiamos el estatus
    instance.production_batch_id = batch.id
    instance.production_status = InstanceStatus.IN_PRODUCTION
    
    db.add(instance)
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