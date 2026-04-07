from sqlmodel import Session, select
from app.models.material import Material
from app.models.design import ProductVersion
from app.models.sales import SalesOrder
from app.models.foundations import GlobalConfig

class CostEngine:
    @staticmethod
    def analyze_order_drift(session: Session, order: SalesOrder) -> dict:
        """
        MOTOR DE AUDITORÍA DE INFLACIÓN (V3.5)
        Compara los costos congelados en la cotización vs los costos reales de almacén hoy.
        """
        # 1. Obtener tolerancia global (por defecto 3%)
        config = session.exec(select(GlobalConfig)).first()
        tolerance = config.cost_tolerance_percent if config else 0.03
        
        total_frozen_cost = 0.0
        total_current_cost = 0.0
        alerts = []

        for item in order.items:
            qty = item.quantity
            total_frozen_cost += (item.frozen_unit_cost * qty)
            
            current_item_cost = 0.0
            # Si tiene receta técnica, recalculamos con precios de HOY
            if item.origin_version_id:
                version = session.get(ProductVersion, item.origin_version_id)
                if version:
                    for comp in version.components:
                        mat = session.get(Material, comp.material_id)
                        if mat:
                            current_item_cost += (comp.quantity * mat.current_cost)
            else:
                # Partida manual: no fluctúa (asumimos costo fijo capturado)
                current_item_cost = item.frozen_unit_cost
                
            total_current_cost += (current_item_cost * qty)
            
            # Auditoría por partida individual para el reporte de "Villanos"
            if item.frozen_unit_cost > 0:
                item_drift = (current_item_cost / item.frozen_unit_cost) - 1
                if item_drift > tolerance:
                    alerts.append({
                        "item": item.product_name,
                        "drift": round(item_drift * 100, 2)
                    })

        # 2. Resultado Final
        variation = 0.0
        if total_frozen_cost > 0:
            variation = (total_current_cost - total_frozen_cost) / total_frozen_cost

        return {
            "is_safe": variation <= tolerance,
            "variation_percent": round(variation * 100, 2),
            "tolerance_percent": round(tolerance * 100, 2),
            "total_current_cost": total_current_cost,
            "critical_items": alerts
        }