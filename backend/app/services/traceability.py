from sqlalchemy.orm import Session
from app.models.sales import SalesOrder, SalesOrderItemInstance # <--- NOMBRE CORREGIDO
from app.models.inventory import InventoryReservation
import uuid

class TraceabilityManager:
    @staticmethod
    def generate_production_instances(db: Session, order: SalesOrder):
        """
        Transforma Partidas en Instancias Físicas (Muebles)
        """
        instances = []
        for item in order.items:
            # Aseguramos que quantity sea entero
            qty_int = int(item.quantity) if item.quantity > 0 else 1
            for i in range(qty_int):
                new_instance = SalesOrderItemInstance( # <--- NOMBRE CORREGIDO
                    sales_order_item_id=item.id,
                    custom_name=f"{item.product_name} - Instancia {i+1}",
                    # QR Único V3.5
                    qr_code=f"VAL-{order.id}-{item.id}-{i+1}-{uuid.uuid4().hex[:6].upper()}",
                    production_status="PENDING" 
                )
                db.add(new_instance)
                instances.append(new_instance)
        
        db.commit()
        return instances

    @staticmethod
    def create_inventory_reservations(db: Session, order: SalesOrder):
        """
        Reserva el material en el almacén (Hard Allocation)
        """
        for item in order.items:
            if item.cost_snapshot and 'ingredients' in item.cost_snapshot:
                for ing in item.cost_snapshot['ingredients']:
                    reservation = InventoryReservation(
                        material_id=ing['material_id'],
                        quantity_reserved=float(ing['qty_recipe']) * float(item.quantity),
                        production_batch_id=order.id,
                        status="ACTIVA"
                    )
                    db.add(reservation)
        
        db.commit()
        return True