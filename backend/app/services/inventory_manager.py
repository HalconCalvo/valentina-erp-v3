from sqlalchemy.orm import Session
from sqlalchemy import select, func
from app.models.material import Material
from app.models.inventory import InventoryTransaction, PurchaseOrder, PurchaseOrderItem
import math
from datetime import datetime

class InventoryManager:
    @staticmethod
    def update_stock_and_cost(
        session: Session, 
        material_id: int, 
        quantity_usage_units: float, 
        total_line_cost: float,
        transaction_type: str,
        reception_id: int = None
    ) -> Material:
        """
        MOTOR ATÓMICO DE INVENTARIO (V3.5)
        Calcula el nuevo costo unitario, actualiza el stock físico y 
        registra el movimiento en el Kárdex.
        """
        material = session.get(Material, material_id)
        if not material:
            return None

        # 1. Cálculo de Costo Unitario (Last Purchase Price con Redondeo SGP)
        new_unit_cost = material.current_cost
        if transaction_type == "PURCHASE_ENTRY" and quantity_usage_units > 0:
            raw_cost = total_line_cost / quantity_usage_units
            new_unit_cost = math.ceil(raw_cost * 100) / 100
            if new_unit_cost == 0.0 and total_line_cost > 0:
                new_unit_cost = 0.01
            
            # Actualizamos el maestro con el último precio de factura
            material.current_cost = new_unit_cost

        # 2. Actualización de Existencias
        material.physical_stock += quantity_usage_units
        
        # Blindaje: El stock físico no puede ser menor a cero en la realidad
        if material.physical_stock < 0:
            material.physical_stock = 0.0

        # 3. Registro en el Kárdex (Trazabilidad Total)
        db_transaction = InventoryTransaction(
            reception_id=reception_id,
            material_id=material.id,
            quantity=quantity_usage_units,
            unit_cost=new_unit_cost,
            subtotal=total_line_cost if quantity_usage_units > 0 else (quantity_usage_units * new_unit_cost),
            transaction_type=transaction_type,
            created_at=datetime.utcnow()
        )
        
        session.add(material)
        session.add(db_transaction)
        return material

    @staticmethod
    def get_low_stock_materials(session: Session, threshold_percent: float = 0.20):
        """
        ALERTA DE COMPRAS (VALENTINA INTELIGENTE - CERO BUCLES): 
        Calcula el Inventario Proyectado = Físico + Tránsito (OCs Activas).
        """
        # 1. Subconsulta: ¿Cuánto material ya viene en camino en OCs vivas?
        transit_subq = (
            select(
                PurchaseOrderItem.material_id,
                func.sum(PurchaseOrderItem.quantity_ordered).label("en_transito")
            )
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
            .where(PurchaseOrder.status.in_(["DRAFT", "AUTORIZADA", "ENVIADA"]))
            .group_by(PurchaseOrderItem.material_id)
            .subquery()
        )

        # 2. Consulta Principal: Proyectado vs Mínimo
        # NOTA: Si tu tabla Material tiene la columna 'committed_stock' 
        # puedes restársela aquí mismo -> "- Material.committed_stock"
        statement = (
            select(Material)
            .outerjoin(transit_subq, Material.id == transit_subq.c.material_id)
            .where(Material.min_stock > 0)
            .where(
                (Material.physical_stock + func.coalesce(transit_subq.c.en_transito, 0)) 
                <= (Material.min_stock * (1 + threshold_percent))
            )
        )
        
        return session.exec(statement).all()


def registrar_movimiento_inventario(
    db,
    material_id: int,
    cantidad: float,
    tipo: str,
    costo_unitario: float = 0.0,
    reception_id: int | None = None,
    project_id: int | None = None,
    reason_code: str | None = None,
    created_at=None,
):
    """
    LIBRO DE MOVIMIENTOS (KÁRDEX) — FASE 1

    Registra un renglón fechado en inventory_transactions SIN tocar physical_stock.
    El ajuste de existencias y el commit siguen siendo responsabilidad de quien
    llama a esta función, para no alterar el comportamiento actual ni la
    transacción de base de datos existente.

    cantidad: positiva para entradas, negativa para salidas.
    created_at: fecha del movimiento. Si es None se usa datetime.now() (igual que el
    comportamiento por defecto previo), por lo que las llamadas existentes que no lo
    pasan no cambian. Permite anclar conteos físicos a su fecha real (Fase 3B).
    """
    if created_at is None:
        created_at = datetime.now()

    movimiento = InventoryTransaction(
        material_id=material_id,
        quantity=cantidad,
        unit_cost=costo_unitario,
        subtotal=abs(cantidad) * costo_unitario,
        transaction_type=tipo,
        reception_id=reception_id,
        project_id=project_id,
        reason_code=reason_code,
        created_at=created_at,
    )
    db.add(movimiento)
    return movimiento


def calcular_saldo_a_fecha(db, material_id: int, fecha) -> float:
    """
    Devuelve el saldo del Kárdex de un material A UNA FECHA dada: la suma de
    quantity de todos los renglones de InventoryTransaction con created_at <= fecha.

    Usa una suma agregada (func.sum) en la base de datos; no trae renglones a memoria.
    Si no hay movimientos, devuelve 0.0.
    """
    resultado = db.exec(
        select(func.sum(InventoryTransaction.quantity)).where(
            InventoryTransaction.material_id == material_id,
            InventoryTransaction.created_at <= fecha,
        )
    ).first()

    # db.exec sobre un select(func.sum(...)) de SQLAlchemy devuelve un Row tipo (valor,)
    # o None si no hay filas. El valor interno además puede ser None cuando no hay
    # movimientos, así que extraemos el escalar con cuidado antes de convertir a float.
    if resultado is None:
        return 0.0
    valor = resultado[0] if hasattr(resultado, "__getitem__") else resultado
    return float(valor) if valor is not None else 0.0