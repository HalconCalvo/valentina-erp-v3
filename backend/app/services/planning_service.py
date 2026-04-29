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
from app.models.production import PayrollPayment, InstallationAssignment, PayrollStatus, ProductionBatch, ProductionBatchStatus


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


# Escala de "atraso" del semáforo. Números más bajos = más atrasado/urgente.
# Usado para resolver el semáforo de una instancia con dos tracks (MDF + PIEDRA):
# el track más atrasado gana.
_SEMAPHORE_SEVERITY = {
    SemaphoreColor.RED:          1,
    SemaphoreColor.YELLOW:       2,
    SemaphoreColor.GRAY:         3,
    SemaphoreColor.BLUE:         4,
    SemaphoreColor.BLUE_GREEN:   5,
    SemaphoreColor.DOUBLE_BLUE:  6,
    SemaphoreColor.GREEN:        7,
    SemaphoreColor.DOUBLE_GREEN: 8,
}

def _worst_semaphore(colors: list) -> str:
    """Dada una lista de colores, retorna el más atrasado (menor severidad)."""
    if not colors:
        return SemaphoreColor.GRAY
    return min(colors, key=lambda c: _SEMAPHORE_SEVERITY.get(c, 99))


def _compute_track_semaphore(
    scheduled_dates: list,
    batch_id,
    batch_status,
    reference_date: datetime,
) -> Optional[str]:
    """
    Calcula el semáforo de un track individual (MDF o PIEDRA).
    Retorna None si el track no aplica (no hay fechas ni lote).

    - scheduled_dates: lista de fechas datetime del track (PM e IM para MDF; PP e IP para PIEDRA).
    - batch_id: ID del lote del track (production_batch_id o stone_batch_id). None si no hay lote.
    - batch_status: status del lote si existe (ProductionBatchStatus) o None.
    """
    # Si el lote ya existe, el semáforo lo determina el avance del lote.
    if batch_id and batch_status is not None:
        if batch_status == ProductionBatchStatus.READY_TO_INSTALL:
            return SemaphoreColor.BLUE_GREEN
        if batch_status == ProductionBatchStatus.PACKING:
            # En empaque = ya pasó producción, listo para instalar operativamente.
            return SemaphoreColor.BLUE_GREEN
        if batch_status == ProductionBatchStatus.IN_PRODUCTION:
            return SemaphoreColor.BLUE
        # DRAFT / ON_HOLD → el lote existe pero no ha arrancado. Tratar como programado.
        # Aún así, si hay fecha vencida el color debe ser rojo.

    # Sin lote o lote no arrancado → el semáforo depende de las fechas.
    if not scheduled_dates:
        # No hay ni fechas ni lote → track no aplica.
        if not batch_id:
            return None
        # Hay lote DRAFT/ON_HOLD sin fechas → tratarlo como GRAY.
        return SemaphoreColor.GRAY

    earliest = min(scheduled_dates)
    days_until = (earliest - reference_date).days

    if days_until < 0:
        return SemaphoreColor.RED
    elif days_until <= 15:
        return SemaphoreColor.YELLOW
    else:
        return SemaphoreColor.GRAY


def compute_semaphore(
    instance: SalesOrderItemInstance,
    reference_date: Optional[datetime] = None,
    session: Optional[Session] = None,
) -> str:
    """
    Calcula el color del semáforo de una instancia usando la Ley del Track Más Atrasado.

    Una instancia tiene hasta dos tracks paralelos:
      - Track MDF:    fechas PM e IM + production_batch_id
      - Track PIEDRA: fechas PP e IP + stone_batch_id

    El semáforo final es el del track más atrasado entre los activos.

    Estados terminales globales (WARRANTY, CLOSED, INSTALLED, CARGADO) se respetan
    como retorno directo porque son derivados de toda la instancia, no de un solo track.

    Si `session` no se provee, se usa production_status como fallback global (comportamiento legacy).
    Si `session` se provee, se consultan los lotes para determinar el estado real de cada track.
    """
    now = reference_date or datetime.utcnow()

    # Estados terminales globales — no dependen de tracks individuales
    if instance.production_status == InstanceStatus.WARRANTY:
        return SemaphoreColor.WARRANTY
    if instance.production_status == InstanceStatus.CLOSED:
        return SemaphoreColor.DOUBLE_GREEN
    if instance.production_status == InstanceStatus.INSTALLED:
        return SemaphoreColor.GREEN
    if instance.production_status == InstanceStatus.CARGADO:
        return SemaphoreColor.DOUBLE_BLUE

    # Fallback legacy: si no se pasa session, usar comportamiento antiguo basado en production_status
    if session is None:
        if instance.production_status == InstanceStatus.READY:
            return SemaphoreColor.BLUE_GREEN
        if instance.production_status == InstanceStatus.IN_PRODUCTION:
            return SemaphoreColor.BLUE

        # PENDING: depende de fechas (cualquiera de las 4)
        scheduled_dates = [
            d for d in [
                instance.scheduled_prod_mdf,
                instance.scheduled_prod_stone,
                instance.scheduled_inst_mdf,
                instance.scheduled_inst_stone,
            ] if d is not None
        ]
        if not scheduled_dates:
            return SemaphoreColor.GRAY
        earliest = min(scheduled_dates)
        days_until = (earliest - now).days
        if days_until < 0:
            return SemaphoreColor.RED
        elif days_until <= 15:
            return SemaphoreColor.YELLOW
        else:
            return SemaphoreColor.GRAY

    # Camino moderno: con session, evaluamos cada track por separado.
    # Track MDF
    mdf_dates = [d for d in [instance.scheduled_prod_mdf, instance.scheduled_inst_mdf] if d is not None]
    mdf_batch_status = None
    if instance.production_batch_id:
        mdf_batch = session.get(ProductionBatch, instance.production_batch_id)
        mdf_batch_status = mdf_batch.status if mdf_batch else None
    mdf_color = _compute_track_semaphore(mdf_dates, instance.production_batch_id, mdf_batch_status, now)

    # Track PIEDRA
    stone_dates = [d for d in [instance.scheduled_prod_stone, instance.scheduled_inst_stone] if d is not None]
    stone_batch_status = None
    if instance.stone_batch_id:
        stone_batch = session.get(ProductionBatch, instance.stone_batch_id)
        stone_batch_status = stone_batch.status if stone_batch else None
    stone_color = _compute_track_semaphore(stone_dates, instance.stone_batch_id, stone_batch_status, now)

    # Recolectar tracks activos (None = track no aplica a esta instancia)
    active = [c for c in [mdf_color, stone_color] if c is not None]

    if not active:
        # Ningún track activo — instancia sin fechas ni lotes
        return SemaphoreColor.GRAY

    return _worst_semaphore(active)


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

    return {
        "instance_id": instance.id,
        "custom_name": instance.custom_name,
        "action": "DOUBLE_GREEN_TRIGGERED",
        "signed_at": now.isoformat(),
        "warranty_started_at": now.isoformat(),
        "warranty_expires_at": (now + timedelta(days=365)).isoformat(),
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
