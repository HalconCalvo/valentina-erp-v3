# Ambiente "Valentina Pruebas"

Aprobado por Gabriel (2026-10-12). Segunda URL en Render con una copia de los datos de producción, para capacitación y
pruebas. Queda permanente.

## Qué ya está hecho en el código
- **Franja roja** "AMBIENTE DE PRUEBAS — los datos no son reales y nada de aquí cuenta" en todas las pantallas y en el
  login. La pestaña del navegador dice "PRUEBAS · Valentina". Se activa con `VITE_APP_ENV=pruebas` (producción no
  la tiene).
- **Sin correos, sin nube real, sin respaldos**: con `APP_ENVIRONMENT=pruebas` el servidor entra solo en modo seguro
  (aunque falte `LOCAL_SAFE_MODE`). Las fotos y firmas que se tomen en Pruebas no se guardan en la nube (quedan
  registradas sin imagen).
- `https://<api de pruebas>/` responde `"Environment": "pruebas", "SafeMode": true` para comprobarlo.
- `backend/scripts/refresh_pruebas_db.sh`: copia producción (solo lectura) a la base de Pruebas. Se niega si el
  destino es producción o si el nombre de la base no contiene "pruebas"; borra la contraseña SMTP en Pruebas.
- `backend/scripts/seed_obra_piloto.py`: crea la obra piloto (ver `docs/OBRA_PILOTO.md`).

## Lo que Gabriel hace en Render (una sola vez, unos 15 minutos)
1. **Base de datos**: New → PostgreSQL. Nombre `valentina-pruebas`, **Database** `valentina_pruebas` (el nombre debe
   llevar "pruebas"), misma región que producción. Plan: el gratuito vence a los 30 días; el más chico de pago la
   deja permanente (decisión de costo de Gabriel).
2. **API**: New → Web Service, mismo repositorio, rama `main`, nombre `valentina-pruebas-api`.
   - Root directory, Build command y Start command: **copiarlos tal cual del servicio `valentina-backend`**
     (Settings de producción).
   - Variables de entorno:
     | Variable | Valor |
     |---|---|
     | `DATABASE_URL` | Internal Database URL de `valentina-pruebas` |
     | `APP_ENVIRONMENT` | `pruebas` |
     | `LOCAL_SAFE_MODE` | `true` |
     | `SECRET_KEY` | botón "Generate" (distinta a producción: las sesiones de un ambiente no sirven en el otro) |
     | `BACKEND_CORS_ORIGINS` | `https://valentina-pruebas.onrender.com` |
   - **No** agregar `GOOGLE_APPLICATION_CREDENTIALS`, el archivo secreto de Google ni datos de correo.
3. **Pantallas**: New → Static Site, mismo repositorio, rama `main`, nombre `valentina-pruebas`.
   - Root directory, Build command, Publish directory y la regla Rewrite `/*` → `/index.html`: **copiarlos de
     `valentina-frontend`**.
   - Variables: `VITE_API_URL` = `https://valentina-pruebas-api.onrender.com/api/v1` y `VITE_APP_ENV` = `pruebas`.
4. **Copiar los datos**: en la Mac, guardar la External Database URL de `valentina-pruebas` en
   `~/.pgurl_valentina_pruebas` (`chmod 600`). Luego Claude Code (o Gabriel) corre, desde `backend/`:
   `scripts/refresh_pruebas_db.sh` (pide escribir PRUEBAS) y `python3 -m scripts.seed_obra_piloto`.
5. Redeploy de `valentina-pruebas-api` para que aplique migraciones sobre la copia.

## Comprobación
- `https://valentina-pruebas-api.onrender.com/` → `"Environment": "pruebas", "SafeMode": true`.
- `https://valentina-pruebas.onrender.com` → franja roja; se entra con el mismo usuario y contraseña de producción.
- Producción sigue igual: `https://valentina-backend.onrender.com/` → `"Environment": "produccion"`.

## Refrescar la copia
Cuando haga falta empezar de cero: `scripts/refresh_pruebas_db.sh` y otra vez `seed_obra_piloto` (todo lo hecho en
Pruebas se pierde).
