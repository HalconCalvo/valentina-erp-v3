from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List
from datetime import date

# Dependencia de base de datos
from app.core.deps import get_session

# Modelos
from app.models.logistics import InstallationAssignment
from app.models.sales import SalesOrderItemInstance, InstanceStatus

router = APIRouter()

# ==========================================
# LOGÍSTICA Y EQUIPOS DE INSTALACIÓN
# ==========================================

@router.post("/equipos/", response_model=InstallationAssignment, status_code=status.HTTP_201_CREATED)
def create_installation_team(
    *,
    db: Session = Depends(get_session),
    instance_id: int,
    leader_user_id: int,
    helper_user_id: int | None = None,
    assignment_date: date | None = None
):
    """
    Arma un Equipo de Instalación y le asigna el material (instancia) a entregar.
    """
    # 1. Validar que la instancia (mueble/bultos) exista
    instance = db.get(SalesOrderItemInstance, instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia no encontrada.")
        
    # 2. CANDADO LOGÍSTICO: Solo puede salir si ya se fabricó
    if instance.production_status not in [InstanceStatus.READY, InstanceStatus.CARGADO]:
        raise HTTPException(
            status_code=400, 
            detail=f"Bloqueo Logístico: El material no está listo en fábrica. Estatus actual: {instance.production_status}"
        )

    # 3. Crear la Asignación del Equipo
    assignment = InstallationAssignment(
        instance_id=instance_id,
        leader_user_id=leader_user_id,
        helper_user_id=helper_user_id,
        assignment_date=assignment_date or date.today(),
        status="EN_TRANSITO"
    )
    db.add(assignment)
    
    # 4. Trigger Logístico: Actualizar la ubicación del material
    instance.production_status = InstanceStatus.CARGADO
    instance.current_location = "En Tránsito (Camión)"
    db.add(instance)
    
    db.commit()
    db.refresh(assignment)
    return assignment


@router.patch("/equipos/{assignment_id}/firma")
def register_client_signature(
    *,
    db: Session = Depends(get_session),
    assignment_id: int,
    signature_url: str
):
    """
    ENDPOINT PARA EL IPAD: El cliente firma de conformidad.
    Libera la nómina del equipo y el cobro final en Tesorería.
    """
    assignment = db.get(InstallationAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación de equipo no encontrada.")
        
    # 1. Actualizar el viaje
    assignment.client_signature_url = signature_url
    assignment.status = "FINALIZADO_CON_FIRMA"
    db.add(assignment)
    
    # 2. Trigger de Negocio: Cerrar la Instancia
    instance = db.get(SalesOrderItemInstance, assignment.instance_id)
    if instance:
        instance.production_status = InstanceStatus.CLOSED
        instance.current_location = "Instalado en Obra"
        db.add(instance)
        
    db.commit()
    db.refresh(assignment)
    
    return {"message": "Firma recabada con éxito. Proyecto cerrado.", "assignment": assignment}