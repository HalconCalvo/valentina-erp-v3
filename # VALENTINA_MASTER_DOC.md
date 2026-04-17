MÓDULO LOGÍSTICA E INSTALACIÓN — Estado al 17/Abr/2026

BACKEND — Completado:
- models/production.py: InstallationAssignmentStatus (SCHEDULED/IN_PROGRESS/COMPLETED)
  helper_1_user_id + helper_2_user_id (máx 2 ayudantes)
- Migración aplicada: 7c73a22582fa (team fields) + f439b0d80c2b (evidence photos)
- endpoints/planning.py: POST /planning/instances/{id}/assign-team
- endpoints/logistics.py:
  POST /equipos/{id}/scan-qr → confirma equipo + CARGADO + nómina
  POST /instances/{id}/evidence → fotos append en SalesOrderItemInstance
  GET /my-workday → LOGISTICS ve las suyas, DIRECTOR/GERENCIA ven todas
  PATCH /equipos/{id}/firma → COMPLETED + trigger_double_green

FRONTEND — Completado:
- /logistics → InstallerWorkdayPage (vista iPad optimizada touch)
- QRScanner.tsx, SignaturePad.tsx
- logistics-service.ts, types/logistics.ts

PENDIENTE (Prompt 8 en curso):
- InstanceEditModal.tsx: sección equipo instalador en píldoras IM/IP
- InstanceEditModal.tsx: tooltip 📅✕ en botón desprogramar
- planning-service.ts: assignTeam() + getInstallers()

PRÓXIMO DESPUÉS DE LOGÍSTICA:
- Generación ZPL (impresora Datamax)
- Dashboard Directivo (6 indicadores)

