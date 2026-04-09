from sqlmodel import Session, create_engine, text
from app.core.config import settings

# Conexión a tu base de datos local
engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

def exorcismo_de_datos():
    with Session(engine) as session:
        print("🔍 Buscando documentos fantasma...")
        
        # 1. Borramos requisiciones que no son útiles o están en estados viejos
        # (Ajusta los estados según los que veas que te estorban)
        session.exec(text("DELETE FROM purchase_requisitions WHERE status NOT IN ('PENDIENTE', 'EN_COMPRA', 'PROCESADA')"))
        
        # 2. Si quieres borrar TODO para empezar de cero con la lógica nueva:
        # session.exec(text("DELETE FROM purchase_order_items"))
        # session.exec(text("DELETE FROM purchase_orders"))
        # session.exec(text("DELETE FROM purchase_requisitions"))
        
        session.commit()
        print("✅ Limpieza completada. Tus contadores deberían marcar cero o solo lo real.")

if __name__ == "__main__":
    exorcismo_de_datos()