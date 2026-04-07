from sqlalchemy.orm import Session
from sqlalchemy import select, text
from app.models.inventory import PurchaseRequisition, PurchaseOrder, PurchaseOrderItem
from app.models.material import Material 
from app.models.foundations import Provider
from typing import List, Dict
import traceback

class PurchaseManager:
    @staticmethod
    def evaluate_and_create_automatic_requisitions(db: Session) -> int:
        """
        EL CEREBRO DE VALENTINA (V4.0 - MATEMÁTICA ANTI-BUCLES)
        """
        try:
            db.execute(text("UPDATE purchase_requisitions SET status = 'PENDIENTE' WHERE status = 'AUTOMATICA'"))
            
            materials = db.execute(
                text("SELECT id, name, physical_stock, min_stock, max_stock FROM materials WHERE min_stock > 0")
            ).mappings().all()
            
            if not materials: return 0

            # Calcular Tránsito (OCs Vivas)
            active_pos = db.execute(
                text("SELECT id FROM purchase_orders WHERE status IN ('BORRADOR', 'AUTORIZADA', 'ENVIADA')")
            ).mappings().all()
            active_po_ids = [str(po['id']) for po in active_pos]
            
            transit_dict = {}
            if active_po_ids:
                ids_str = ",".join(active_po_ids)
                items = db.execute(
                    text(f"SELECT material_id, quantity_ordered FROM purchase_order_items WHERE purchase_order_id IN ({ids_str})")
                ).mappings().all()
                for item in items:
                    m_id = item['material_id']
                    if m_id is not None:
                        transit_dict[m_id] = transit_dict.get(m_id, 0.0) + float(item['quantity_ordered'] or 0.0)

            created_count = 0
            
            for mat in materials:
                m_id = mat['id']
                phys = float(mat['physical_stock'] or 0.0)
                min_s = float(mat['min_stock'] or 0.0)
                transit = transit_dict.get(m_id, 0.0)

                # REGLA: ¿Realmente falta material proyectado?
                if (phys + transit) <= min_s:
                    
                    check_sql = text("""
                        SELECT id FROM purchase_requisitions 
                        WHERE material_id = :m_id 
                        AND UPPER(status) IN ('PENDIENTE', 'EN_COMPRA', 'APLAZADA')
                    """)
                    existing = db.execute(check_sql, {"m_id": m_id}).first()

                    if not existing:
                        max_s = float(mat['max_stock'] or 0.0)
                        
                        # MATEMÁTICA ANTI-BUCLES: 
                        # Aseguramos que el pedido rebase el mínimo (aunque sea por 1 unidad) para romper el empate (<=)
                        target_stock = max_s if max_s > min_s else (min_s + 1.0)
                        qty_to_order = target_stock - (phys + transit)
                        
                        if qty_to_order <= 0: qty_to_order = 1.0
                        qty_to_order = round(qty_to_order, 2)
                        
                        db.execute(
                            text("""
                            INSERT INTO purchase_requisitions 
                            (material_id, custom_description, requested_quantity, status, notes, created_at) 
                            VALUES 
                            (:m_id, 'REPOSICIÓN AUTOMÁTICA', :qty, 'PENDIENTE', 'Generado por Valentina (Stock bajo mínimo)', CURRENT_TIMESTAMP)
                            """),
                            {"m_id": m_id, "qty": qty_to_order}
                        )
                        created_count += 1
            db.commit()
            return created_count

        except Exception as e:
            print(f"\n🚨 ERROR CRÍTICO EN VALENTINA: {e}")
            traceback.print_exc()
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