import sqlite3
from passlib.context import CryptContext

# 1. Configurar la encriptación de contraseña (igual que tu sistema)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_admin():
    print("🔑 Generando usuario Administrador...")

    # 2. Datos del usuario
    email = "admin@sgp.com"
    password = "123"  # <--- Tu contraseña temporal
    hashed_password = pwd_context.hash(password)
    
    # 3. Conectar a la base de datos (asegúrate que el nombre coincida)
    conn = sqlite3.connect("sgp_v3.db")
    cursor = conn.cursor()

    try:
        # 4. Insertar el usuario (Incluyendo el nuevo campo commission_rate)
        # Nota: Asumimos que el ID se autogenera.
        cursor.execute("""
            INSERT INTO users (email, full_name, role, is_active, commission_rate, hashed_password)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (email, "Admin Inicial", "ADMIN", 1, 0.0, hashed_password))

        conn.commit()
        print(f"✅ Éxito! Usuario creado: {email} / Pass: {password}")
        
    except sqlite3.IntegrityError:
        print("⚠️ El usuario ya existe.")
    except Exception as e:
        print(f"❌ Error: {e}")
        # Si falla porque no encuentra la tabla, es que no has corrido el backend primero
        print("TIP: Asegúrate de haber iniciado el backend al menos una vez para que cree las tablas.")
    finally:
        conn.close()

if __name__ == "__main__":
    create_admin()