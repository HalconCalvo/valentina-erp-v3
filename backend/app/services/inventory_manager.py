from app.services import inventory_service


class InventoryManager:
    @staticmethod
    def update_stock_and_cost(
        session,
        material_id: int,
        quantity_usage_units: float,
        total_line_cost: float,
        transaction_type: str = "PURCHASE_ENTRY",
        reception_id: int = None,
    ):
        from app.repositories import inventory_repository as inventory_repo

        unit_cost = total_line_cost / quantity_usage_units if quantity_usage_units > 0 else 0.0
        inventory_service.register_movement(
            session,
            material_id,
            transaction_type if transaction_type in inventory_service.VALID_MOVEMENT_TYPES else "PURCHASE_ENTRY",
            abs(float(quantity_usage_units)),
            unit_cost=unit_cost,
            reception_id=reception_id,
            commit=False,
        )
        return inventory_repo.get_material_by_id(session, material_id)

    @staticmethod
    def get_low_stock_materials(session, threshold_percent: float = 0.20):
        from app.repositories import inventory_repository as inventory_repo

        return inventory_repo.get_low_stock_materials(session, threshold_percent)


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
    """Compatibilidad hacia atrás: delega en inventory_service.register_movement."""
    legacy_map = {
        "ENTRADA_COMPRA": "PURCHASE_ENTRY",
        "AJUSTE_POSITIVO": "ADJUSTMENT_IN",
        "AJUSTE_NEGATIVO": "ADJUSTMENT_OUT",
        "AJUSTE_INICIAL": "OPENING_BALANCE",
        "AJUSTE_CORRECCION": "ADJUSTMENT_OUT",
        "SALIDA_INSTALACION": "PRODUCTION_EXIT",
        "CREDIT_NOTE_RETURN": "RETURN",
    }
    cant = float(cantidad or 0)
    if tipo == "AJUSTE_CONTEO_FISICO":
        movement_type = "ADJUSTMENT_IN" if cant >= 0 else "ADJUSTMENT_OUT"
    elif tipo in legacy_map:
        movement_type = legacy_map[tipo]
    elif cant >= 0:
        movement_type = "ADJUSTMENT_IN"
    else:
        movement_type = "ADJUSTMENT_OUT"

    return inventory_service.register_movement(
        db,
        material_id,
        movement_type,
        abs(cant),
        unit_cost=costo_unitario,
        reason=reason_code,
        reception_id=reception_id,
        project_id=project_id,
        created_at=created_at,
        commit=False,
    )


def calcular_saldo_a_fecha(db, material_id: int, fecha):
    from app.repositories import inventory_repository as inventory_repo

    return inventory_repo.calcular_saldo_a_fecha(db, material_id, fecha)
