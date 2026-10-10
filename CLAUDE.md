# Valentina ERP — Reglas del proyecto

Gabriel Frías es el Director del Proyecto. Claude Code es arquitecto y programador.
Código y comentarios en inglés. Comunicación con Gabriel en español, breve y directa.

---

## 1. FORMA DE TRABAJO

### Autonomía
1. **Decisiones técnicas:** las toma Claude Code siguiendo este archivo, sin preguntar.
2. **Decisiones de negocio** (precios, márgenes, roles, permisos, reglas de operación, qué ve cada usuario):
   no detienen el trabajo. Se anotan en `docs/DECISIONES_PENDIENTES.md` con contexto, opciones y
   recomendación. Si es reversible se aplica la recomendación; si no, se salta a la siguiente tarea.
   Gabriel las revisa en bloque.
3. **Orden de trabajo:** `docs/ROADMAP.md`. Se toma la tarea de mayor prioridad: plan → implementación →
   pruebas → commit → siguiente tarea, sin esperar.
4. **Fuera de alcance:** si aparece algo que no es de la tarea, se anota en ROADMAP o DECISIONES_PENDIENTES
   y se sigue. No se arregla "de pasada" lo que cambia comportamiento.

### Push a producción (main → Render despliega solo)
Permitido sin pedir autorización SOLO si se cumplen todas:
- pasan todos los tests (backend y frontend) y el build;
- se probó en pantalla en la copia local;
- las migraciones se probaron en la copia local (subir, bajar, subir);
- es fuera de horario laboral (hora Mérida). Horario laboral: lunes a viernes de 8:00 a 18:00; fuera de eso (noches, sábados y domingos) se permite.
Si alguna no se cumple: commit local y se sigue con otra tarea.

### Bitácora del proyecto
- Al terminar cada tarea: actualizar `journal.txt` (formato existente) y `docs/ROADMAP.md`.
- El journal registra decisiones, estado, pendientes y lecciones. Nunca credenciales.

---

## 2. ENTORNO Y BASES DE DATOS

- **Producción:** PostgreSQL en Render. Conexión en `~/.pgurl_valentina` y `backend/.env`.
  Solo lectura (SELECT). **Nunca INSERT, UPDATE ni DELETE en producción.**
- **Copia local:** PostgreSQL 16, puerto 5433, base `valentina_local`. Conexión en `~/.pgurl_valentina_local`.
  Se refresca con `pg_dump` de producción (solo lectura); respaldos en `~/valentina_local/dumps` (borrar los viejos).
  Al restaurar: neutralizar la contraseña SMTP.
- **Arranque local:** backend `backend/scripts/run_local.sh` (LOCAL_SAFE_MODE: sin respaldos, sin subidas a la
  nube, sin correos); frontend `VITE_API_URL=http://localhost:8000/api/v1 npx vite --port 3000`.
- **Alembic carga `backend/.env` (producción).** Antes de migrar en local, exportar la URL local y verificar
  el host. Las migraciones de producción solo las aplica Render al desplegar.
- **Verificar antes de actuar:** versión de migración actual, si un archivo existe antes de sobrescribirlo,
  a qué base apunta la conexión.
- Nunca escribir credenciales, contraseñas o tokens en archivos del repo.

---

## 3. PRUEBAS Y CHECKLIST (antes de dar algo por terminado)

### Pruebas
- Toda funcionalidad se prueba con tests **y en pantalla** (extensión Claude in Chrome contra la copia local),
  como la usaría el usuario real. Probar solo por API no basta.
- Si un test falla, se investiga la causa. Nunca se relaja un test para que pase.
- Al terminar: tests backend, tests frontend, build, `alembic heads` (una sola cabeza), checklist.

### Frontend
- [ ] Componentes del sistema, nunca HTML nativo:
      `Input` (no `<input>`), `SearchableSelect` (no `<select>`), `VTable` (no `<table>`),
      `toast` (no `alert`), `VConfirmDialog` (no `window.confirm`), `Modal` (no div fijo),
      `VEmptyState` (listas vacías).
- [ ] Cero `console.*`, cero `fetch()` directo (siempre `axiosClient`), cero spinners ad hoc.
- [ ] Botones deshabilitados mientras procesan (sin doble clic).
- [ ] Entidades del sistema (material, proveedor, cliente, producto, usuario) siempre con `SearchableSelect`:
      desde 2 caracteres, máx. 8 sugerencias, busca por nombre y código, prellena los campos relacionados.
- [ ] Acciones: ícono con descripción (title) para acciones universales (ver, editar, PDF);
      botón con texto para acciones de flujo o irreversibles (autorizar, aplicar, generar OV, cancelar).
- [ ] Máximo 3 clics desde el menú a cualquier acción.
- [ ] Formatos: moneda `Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})`,
      negativos como `-$1,234.56`; fechas `DD/MM/AAAA` en hora de Mérida; montos indican si son con o sin IVA.
- [ ] Pantallas según `docs/GUIA_PANTALLAS.md` (una vez aprobada). No inventar estilos nuevos.

### Backend
- [ ] Capas: Endpoint (HTTP, rol, llamar service; máx. 20 líneas) → Service (lógica; máx. 50 líneas por
      función) → Repository (solo consultas; máx. 30 líneas por función).
- [ ] Cero lógica o consultas en endpoints, cero imports dentro de funciones, cero `print()`.
- [ ] Schemas Pydantic en `app/schemas/` con sufijos `Create`, `Update`, `Read`. Nunca inline.
- [ ] Todo endpoint pide sesión; las escrituras validan rol (403 si no cumple).
- [ ] Todo cambio de modelo con migración Alembic (`server_default` en tablas con datos; respetar `down_revision`).
- [ ] Nunca DELETE físico (ver regla de oro).
- [ ] Respuestas nunca exponen datos sensibles (contraseñas, hashes, tokens): usar schemas `Read` acotados.

---

## 4. REGLAS DE NEGOCIO KOLOKA

### Regla de oro
Todo lo que se crea se puede corregir; todo lo que se corrige se puede cancelar.
**Nada se elimina físicamente.** Cancelar = motivo obligatorio + `VConfirmDialog` con consecuencias +
reversión automática de saldos y registros ligados + fecha, hora y usuario.
La bitácora de cambios (`audit_field_changes`) registra quién, cuándo, qué campo y valor antes/después.

### Todo flujo nuevo define sus 4 caminos antes de construirse
1. **Feliz** — todo sale bien.
2. **Corrección** — error humano antes de efecto externo.
3. **Excepción** — error después de efecto externo.
4. **Cancelación** — acuerdo entre partes.

### Roles
| Rol | Alcance |
|---|---|
| DIRECTOR | Acceso total. Único que autoriza cotizaciones, órdenes de cambio y corrige recetas. |
| MANAGER | Finanzas, autorización de OCs, aprobación de inventario, bitácora. |
| ADMIN | Compras, proveedores, pagos (sin ejecutar). |
| SALES | Solo sus cotizaciones y OVs. |
| DESIGN | Diseño e ingeniería (recetas). |
| PRODUCTION | Producción y solicitudes de compra. |
| WAREHOUSE | Compras y almacén. |
| LOGISTICS | Logística e instalación. |
Operaciones financieras: solo DIRECTOR, MANAGER y ADMIN.

### Ventas
- **Cotización y OV son registros distintos.** Cotización: Borrador → En revisión → Autorizada → Convertida en OV
  (o Cambios solicitados, Perdida, Vencida, Cancelada). La OV nace al "Generar OV" con folio y fecha de la OC
  del cliente, en "Esperando anticipo".
- **Todo cambio de dinero en una OV** (agregar partidas, cantidades, precios, cancelar partidas) pasa por una
  **orden de cambio** `CAM-<OV>-<n>`: el Director la autoriza y después se aplica (dos pasos). Una abierta a la vez.
  La descripción comercial se edita directo, con traza.
- Anticipo: puede haber varias facturas de anticipo (anticipo complementario). Notas de crédito a clientes se
  emiten en Compaq y solo se capturan en Valentina.

### Precio, márgenes y comisión (una sola fuente: `margin_service.py` / `margins.ts`)
- **Sobreprecio %** (para FIJAR precio) = (precio × (1 − c) − costo) / costo.
- **Precio** = costo × (1 + sobreprecio) ÷ (1 − c).
- **Comisión** = c × venta sin IVA.
- **Margen neto % sobre venta** (para ANÁLISIS, después de comisión) = (venta sin IVA − costo − comisión) / venta sin IVA.
- Sobreprecio mínimo configurable (GlobalConfig, solo DIRECTOR; hoy 25%): por debajo se marca en rojo, no bloquea.
- Nunca usar la palabra "Margen" sola: siempre "Sobreprecio %" o "Margen neto % sobre venta".

### Recetas y costos
- Una versión de receta usada por una OV o cotización en revisión/autorizada es **inmutable**; para cambiarla se clona.
- El Director corrige recetas y precios de materiales al autorizar una cotización: se crea versión nueva,
  la anterior queda obsoleta e intacta para lo cerrado; los precios se actualizan en el catálogo. Motivo obligatorio.
- `Material.current_cost` es por **unidad de compra**; todo cálculo por unidad de uso divide entre el factor de conversión.
- Costo de receta exacto por renglón, total a 2 decimales.

### Inventario
- **Solo la ruta MATERIAL lleva existencia** (entra a conteo, valuación y reservas). PROCESO, CONSUMIBLE y SERVICIO no.
- Descarga: al **entrar a producción** el material principal (tablero/piedra) y consumibles de fábrica
  (chapacinta, insumos); al **surtir** herrajes, accesorios, electro, vidrio, electricidad y especiales
  (red de seguridad al cargar el camión).
- Entrada a producción se bloquea solo si falta material principal (DIRECTOR/MANAGER puede autorizar en negativo
  con motivo) o si la OV tiene anticipo pactado sin pagar.
- Tres cajones de valuación: materia prima, producción en proceso, producto terminado. Al cargar para instalar pasa a costo de venta.
- Movimientos con **fecha efectiva** y **fecha de registro**. Corte de inventario a las 23:59:59 hora Mérida.
  Al aprobar un corte el periodo se cierra; reabrir solo DIRECTOR con motivo.
- Conteo físico ciego: el contador nunca ve la existencia teórica. Aprobación si diferencia > 5%, valor > umbral
  (GlobalConfig, hoy $2,000), teórica 0 con conteo, o teórica negativa.

---

## 5. REFERENCIAS
- `journal.txt` — historia de sesiones, decisiones y pendientes.
- `docs/ROADMAP.md` — orden de trabajo.
- `docs/DECISIONES_PENDIENTES.md` — decisiones de negocio esperando a Gabriel.
- `docs/GUIA_PANTALLAS.md` — estándar visual (pendiente de aprobación).
- `CLAUDE_FULL.md` — **histórico, no vigente.** Si contradice este archivo, manda este archivo.
