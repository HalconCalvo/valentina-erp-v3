"""
planning_service.py  –  Módulo de Planeación Estratégica: Matriz de 4 Carriles

Responsabilidades:
  1. Calcular el semáforo dinámico de 7 estados para cada instancia.
  2. Disparar el EVENTO MAESTRO de Doble Verde (🟢🟢): cierre + garantía + nómina.
  3. Gestionar reapertura de instancias para Órdenes de Garantía (⚠️).
"""
from datetime import datetime, timedelta
from typing import Optional, List, Tuple
from sqlmodel import Session, select

from app.models.sales import SalesOrderItemInstance, InstanceStatus
from app.models.production import PayrollPayment, InstallationAssignment, PayrollStatus


# ============================================================
# 1. SEMÁFORO DINÁMICO DE 7 ESTADOS
# ============================================================

class SemaphoreColor(str):
    """Colores del semáforo preventivo (usados en el calendario y sidebar)."""
    GRAY    = "GRAY"        # 🔘 Programado (+30 días)
    YELLOW  = "YELLOW"      # 🟡 Alerta (< 15 días para fecha programada)
    RED     = "RED"         # 🔴 Crítico (fecha vencida sin evento real)
    BLUE    = "BLUE"        # 🔵 En Proceso (lote generado)
    BLUE_GREEN = "BLUE_GREEN"  # 🔵🟢 Listo para Instalarse
    DOUBLE_BLUE = "DOUBLE_BLUE"  # 🔵🔵 En Instalación (cuadrilla en tránsito)
    GREEN   = "GREEN"       # 🟢 Instalado (evidencia fotográfica)
    DOUBLE_GREEN = "DOUBLE_GREEN"  # 🟢🟢 Cerrado (firma de conformidad)
    WARRANTY = "WARRANTY"   # ⚠️ Garantía


def compute_semaphore(instance: SalesOrderItemInstance, reference_date: Optional[datetime] = None) -> str:
    """
    Calcula el color del semáforo para una instancia.
    Retorna un valor de SemaphoreColor.
    """
    now = reference_date or datetime.utcnow()

    # Estados terminales — no dependen de fechas
    if instance.production_status == InstanceStatus.WARRANTY:
        return SemaphoreColor.WARRANTY
    if instance.production_status == InstanceStatus.CLOSED:
        return SemaphoreColor.DOUBLE_GREEN
    if instance.production_status == InstanceStatus.INSTALLED:
        return SemaphoreColor.GREEN
    if instance.production_status == InstanceStatus.CARGADO:
        return SemaphoreColor.DOUBLE_BLUE
    if instance.production_status == InstanceStatus.READY:
        return SemaphoreColor.BLUE_GREEN
    if instance.production_status == InstanceStatus.IN_PRODUCTION:
        return SemaphoreColor.BLUE

    # Estado PENDING — depende de fechas programadas
    # Usamos la fecha más próxima de las 4 programadas como referencia
    scheduled_dates = [
        d for d in [
            instance.scheduled_prod_mdf,
            instance.scheduled_prod_stone,
            instance.scheduled_inst_mdf,
            instance.scheduled_inst_stone,
        ] if d is not None
    ]

    if not scheduled_dates:
        return SemaphoreColor.GRAY  # Sin fechas programadas

    earliest = min(scheduled_dates)
    days_until = (earliest - now).days

    if days_until < 0:
        return SemaphoreColor.RED       # Fecha vencida sin evento
    elif days_until <= 15:
        return SemaphoreColor.YELLOW    # Alerta: faltan ≤ 15 días
    elif days_until <= 30:
        return SemaphoreColor.YELLOW    # Alerta amplia
    else:
        return SemaphoreColor.GRAY      # +30 días, planeación a largo plazo


def compute_semaphore_label(color: str) -> str:
    labels = {
        SemaphoreColor.GRAY:         "🔘 Programado",
        SemaphoreColor.YELLOW:       "🟡 Alerta",
        SemaphoreColor.RED:          "🔴 Crítico",
        SemaphoreColor.BLUE:         "🔵 En Proceso",
        SemaphoreColor.BLUE_GREEN:   "🔵🟢 Listo para Instalarse",
        SemaphoreColor.DOUBLE_BLUE:  "🔵🔵 En Instalación",
        SemaphoreColor.GREEN:        "🟢 Instalado",
        SemaphoreColor.DOUBLE_GREEN: "🟢🟢 Cerrado",
        SemaphoreColor.WARRANTY:     "⚠️ Garantía",
    }
    return labels.get(color, "—")


# ============================================================
# 2. PROCESO DE ABREVIATURA DE CARRILES (para píldoras)
# ============================================================

LANE_CODES = {
    "scheduled_prod_mdf":   "PM",
    "scheduled_prod_stone": "PP",
    "scheduled_inst_mdf":   "IM",
    "scheduled_inst_stone": "IP",
}

LANE_LABELS = {
    "PM": "Prod. MDF",
    "PP": "Prod. Piedra",
    "IM": "Inst. MDF",
    "IP": "Inst. Piedra",
}


# ============================================================
# 3. EVENTO MAESTRO: DOBLE VERDE 🟢🟢 (Firma de Conformidad)
# ============================================================

def trigger_double_green(
    instance: SalesOrderItemInstance,
    session: Session,
    signed_at: Optional[datetime] = None,
) -> dict:
    """
    Dispara el Evento Maestro al capturar la Firma de Conformidad.

    Acciones:
      A) Cambia el estatus de la instancia a CLOSED.
      B) Registra signed_received_at y warranty_started_at.
      C) Mueve PayrollPayment vinculados a READY_TO_PAY.
      D) Retorna un resumen de acciones para que el endpoint
         lo incluya en la respuesta (notificación a Administración).
    """
    now = signed_at or datetime.utcnow()

    # A + B: Cerrar instancia y activar garantía
    instance.production_status = InstanceStatus.CLOSED
    instance.signed_received_at = now
    instance.warranty_started_at = now
    session.add(instance)

    # C: Mover PayrollPayments vinculados a READY_TO_PAY
    payroll_updated: List[int] = []
    stmt = (
        select(PayrollPayment)
        .join(InstallationAssignment,
              PayrollPayment.installation_assignment_id == InstallationAssignment.id)
        .where(InstallationAssignment.instance_id == instance.id)
        .where(PayrollPayment.status == PayrollStatus.PENDING_SIGNATURE)
    )
    payroll_rows = session.exec(stmt).all()
    for pp in payroll_rows:
        pp.status = PayrollStatus.READY_TO_PAY
        session.add(pp)
        payroll_updated.append(pp.id)

    session.flush()

    return {
        "instance_id": instance.id,
        "custom_name": instance.custom_name,
        "action": "DOUBLE_GREEN_TRIGGERED",
        "signed_at": now.isoformat(),
        "warranty_started_at": now.isoformat(),
        "warranty_expires_at": (now + timedelta(days=365)).isoformat(),
        "payroll_payments_released": payroll_updated,
        "admin_notification": (
            f"Instancia '{instance.custom_name}' cerrada. "
            "Iniciar Solicitud de Estimación/Facturación en Administración."
        ),
    }


# ============================================================
# 4. REAPERTURA DE GARANTÍA ⚠️
# ============================================================

def reopen_as_warranty(
    instance: SalesOrderItemInstance,
    session: Session,
) -> dict:
    """
    Reabre una instancia CLOSED para generar una Orden de Garantía.
    Preserva el historial del cierre original.
    """
    if instance.production_status != InstanceStatus.CLOSED:
        raise ValueError(
            f"Solo se pueden reabrir instancias en estado CLOSED. "
            f"Estatus actual: {instance.production_status}"
        )

    now = datetime.utcnow()

    # Preservar historial de cierre original
    instance.original_signed_at = instance.signed_received_at
    instance.is_warranty_reopened = True
    instance.warranty_reopened_at = now
    instance.production_status = InstanceStatus.WARRANTY

    # Limpiar fechas de programación para reprogramar reparación
    instance.scheduled_prod_mdf = None
    instance.scheduled_prod_stone = None
    instance.scheduled_inst_mdf = None
    instance.scheduled_inst_stone = None

    session.add(instance)
    session.flush()

    return {
        "instance_id": instance.id,
        "custom_name": instance.custom_name,
        "action": "WARRANTY_REOPENED",
        "reopened_at": now.isoformat(),
        "original_close_date": instance.original_signed_at.isoformat() if instance.original_signed_at else None,
        "message": (
            f"Instancia '{instance.custom_name}' reabierta como Garantía ⚠️. "
            "El historial del cierre original fue preservado. "
            "Reprograma las fechas de reparación en el Tablero de Planeación."
        ),
    }


# ============================================================
# 5. RECÁLCULO PROPORCIONAL DE FECHAS (Drag & Drop)
# ============================================================

def recalculate_dates_proportionally(
    instance: SalesOrderItemInstance,
    moved_field: str,
    new_date: datetime,
) -> dict:
    """
    Cuando el usuario arrastra una píldora a un nuevo día en el calendario,
    recalcula proporcionalmente las fechas siguientes de la cadena.

    moved_field: uno de 'scheduled_prod_mdf', 'scheduled_prod_stone',
                 'scheduled_inst_mdf', 'scheduled_inst_stone'

    Retorna un dict con los nuevos valores para todos los campos afectados.
    """
    CHAIN_ORDER = [
        "scheduled_prod_mdf",
        "scheduled_prod_stone",
        "scheduled_inst_mdf",
        "scheduled_inst_stone",
    ]

    old_value: Optional[datetime] = getattr(instance, moved_field)
    if old_value is None:
        # No hay fecha previa — sólo actualizar el campo movido
        return {moved_field: new_date}

    delta = new_date - old_value
    moved_idx = CHAIN_ORDER.index(moved_field)

    updates: dict = {moved_field: new_date}

    # Recalcular proporcionalmente las fechas SIGUIENTES en la cadena
    for field in CHAIN_ORDER[moved_idx + 1:]:
        current: Optional[datetime] = getattr(instance, field)
        if current is not None:
            updates[field] = current + delta

    return updates
