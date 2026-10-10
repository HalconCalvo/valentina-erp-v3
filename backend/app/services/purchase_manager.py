from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from app.core.logger import log_error
from app.models.inventory import PurchaseRequisition, PurchaseOrder, PurchaseOrderItem
from app.models.material import Material 
from app.models.foundations import Provider
from app.repositories import purchase_repository as purchase_repo
from typing import List, Dict

AUTO_REQUISITION_NOTE = "Generado por Valentina (Stock bajo mínimo)"


def _reorder_quantity(material: Material, transit: float) -> float:
    """Anti-loop math: the order always takes the stock above the minimum (at least by one unit)."""
    phys = float(material.physical_stock or 0.0)
    min_s = float(material.min_stock or 0.0)
    max_s = float(material.max_stock or 0.0)
    target_stock = max_s if max_s > min_s else (min_s + 1.0)
    qty = target_stock - (phys + transit)
    return round(qty if qty > 0 else 1.0, 2)


def _refresh_automatic_requisitions(db: Session) -> None:
    for req in purchase_repo.get_requisitions_by_status(db, "AUTOMATICA"):
        req.status = "PENDIENTE"
        db.add(req)
    # Auto-close: alarms whose stock is already above the minimum
    for req in purchase_repo.get_open_auto_requisitions_with_stock(db):
        req.status = "PROCESADA"
        db.add(req)
    db.flush()


def _create_missing_requisitions(db: Session) -> int:
    transit_by_material = purchase_repo.get_transit_by_material(db)
    created = 0
    for material in purchase_repo.get_stock_materials_with_minimum(db):
        transit = transit_by_material.get(material.id, 0.0)
        if float(material.physical_stock or 0.0) + transit > float(material.min_stock or 0.0):
            continue
        if purchase_repo.has_active_requisition(db, material.id):
            continue
        db.add(PurchaseRequisition(
            material_id=material.id, custom_description=purchase_repo.AUTO_REQUISITION_DESCRIPTION,
            requested_quantity=_reorder_quantity(material, transit), status="PENDIENTE", notes=AUTO_REQUISITION_NOTE,
        ))
        created += 1
    return created


class PurchaseManager:
    @staticmethod
    def evaluate_and_create_automatic_requisitions(db: Session) -> int:
        """Automatic requisitions for stock materials below their minimum (counting stock in transit)."""
        try:
            _refresh_automatic_requisitions(db)
            created = _create_missing_requisitions(db)
            db.commit()
            return created
        except SQLAlchemyError as exc:
            log_error("evaluate_automatic_requisitions", exc)
            db.rollback()
            return 0

    @staticmethod
    def get_consolidated_requisitions(db: Session) -> List[Dict]:
        statement = select(PurchaseRequisition).where(
            PurchaseRequisition.status.in_(["PENDIENTE", "EN_COMPRA"])
        )
        requisitions = db.exec(statement).scalars().all()
        consolidation = {}

        for req in requisitions:
            provider_id = "unassigned"
            provider_name = "SIN PROVEEDOR ASIGNADO"
            credit_days = 0 
            sku = "N/A"
            last_cost = 0.0
            material_name = req.custom_description or "Material Desconocido"

            if req.material_id:
                material = db.get(Material, req.material_id)
                if material:
                    sku = material.sku if material.sku else "S/SKU"
                    material_name = material.name if material.name else material_name
                    last_cost = float(material.current_cost) if material.current_cost is not None else 0.0
                    if material.provider_id:
                        provider_id = material.provider_id
                        prov_obj = db.get(Provider, material.provider_id)
                        if prov_obj:
                            provider_name = prov_obj.business_name
                            credit_days = getattr(prov_obj, 'credit_days', 0) or 0

            key = str(provider_id)
            if key not in consolidation:
                consolidation[key] = {
                    "provider_id": provider_id if provider_id != "unassigned" else None,
                    "provider_name": provider_name,
                    "credit_days": credit_days,
                    "items": [],
                    "total_estimated": 0.0
                }

            qty = float(req.requested_quantity) if req.requested_quantity is not None else 0.0
            item_total = qty * last_cost
            
            consolidation[key]["items"].append({
                "requisition_id": req.id,
                "material_id": req.material_id,
                "name": material_name,
                "sku": sku,
                "qty": qty,
                "expected_cost": last_cost,
                "subtotal": item_total,
                "notes": req.notes,
                "original_desc": req.custom_description
            })
            consolidation[key]["total_estimated"] += item_total

        return list(consolidation.values())