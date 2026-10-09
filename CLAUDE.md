---

# Valentina ERP — Reglas absolutas

## FLUJO DE TRABAJO CON CLAUDE CODE
1. Claude Code actúa como arquitecto y programador. Gabriel es el Director del Proyecto: aprueba o rechaza todo. Cursor queda como respaldo.
2. Ningún archivo se modifica sin un plan aprobado explícitamente por Gabriel.
3. Todo plan incluye: problema, objetivo, archivos a tocar, migraciones Alembic necesarias, riesgos, y los 4 caminos si es un flujo nuevo.
4. Implementar solo lo aprobado. Si surge algo fuera del alcance, detenerse y reportarlo.
5. Antes de reportar listo: checklist de CLAUDE.md, build de frontend, tests de backend y revisión de la cadena de migraciones.
6. Gabriel revisa el diff. Commit y push solo con su autorización explícita.
7. Base de datos: solo consultas de lectura (SELECT) sin pedir permiso. Cualquier INSERT, UPDATE o DELETE requiere aprobación explícita de Gabriel.
8. Nunca escribir credenciales, contraseñas o tokens en archivos del repo.
9. Al cerrar cada sesión, agregar una entrada a journal.txt con el formato existente.
10. Código y comentarios en inglés. Comunicación con Gabriel en español, breve y directa.

---

## ROL
- Gabriel = Director del Proyecto. Aprueba o rechaza planes, revisa diffs, autoriza commits.
- Claude Code = arquitecto y programador. Define la arquitectura, los 4 caminos
  y el CRUD; implementa solo lo aprobado.
- Cursor = respaldo. Si se usa, sigue estas mismas reglas y lo definido por
  Claude; no toma decisiones de arquitectura ni de negocio.
- Antes de cualquier commit se verifica con grep el checklist obligatorio.

---

## FRONTEND — CERO TOLERANCIA

### Componentes obligatorios (nunca HTML nativo):
| En vez de | Usar |
|-----------|------|
| `<input>` | `Input` de `@/components/ui/Input` |
| `<select>` | `SearchableSelect` de `@/components/ui/SearchableSelect` |
| `<table>` | `VTable` de `@/components/ui/VTable` |
| `alert()` | `toast` de `@/components/ui/VToast` |
| `window.confirm()` | `VConfirmDialog` de `@/components/ui/VConfirmDialog` |
| `div fixed` manual | `Modal` de `@/components/ui/Modal` |
| Estado vacío ad-hoc | `VEmptyState` de `@/components/ui/VEmptyState` |

### Botones de acción (todo el sistema):
- Acciones universales (ver, editar, descargar PDF): solo ícono, con
  descripción al pasar el cursor (title).
- Acciones de flujo o irreversibles (autorizar, aplicar, generar OV,
  cancelar): botón con texto.
- Las tablas existentes se ajustan conforme se toquen.

### Prohibido absolutamente:
- `console.log`, `console.error`, `console.warn`
- `fetch()` directo — siempre `axiosClient`
- Doble clic — deshabilitar botón mientras procesa
- Spinners ad-hoc — usar estado de carga del botón

### Formato de moneda obligatorio:
Todo campo o display de moneda usa formato de miles con dos decimales fijos.
Usar siempre: Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
Nunca mostrar montos sin decimales o con decimales variables.

### Autocomplete obligatorio:
- Todo campo que referencie entidad del sistema usa `SearchableSelect`
- Activar desde 2 caracteres escritos
- Mostrar máximo 8 sugerencias visibles a la vez
- Conforme el usuario escribe más, el filtro se afina — nunca corta la búsqueda
- Filtrado case-insensitive por nombre Y código/SKU simultáneamente
- Al seleccionar: prellenar TODOS los campos relacionados automáticamente
- Nunca texto libre para entidades existentes (material, proveedor,
  cliente, producto, usuario)

### Principio de 3 clics:
Máximo 3 clics desde el menú para llegar a cualquier acción.
Si se necesitan más, el diseño está mal — reportar a Gabriel.

---

## BACKEND — CERO TOLERANCIA

### Capas (inamovibles):
- **Endpoint**: recibe HTTP, valida rol, llama service, devuelve respuesta. Máx 20 líneas.
- **Service**: toda la lógica de negocio. Máx 50 líneas por función.
- **Repository**: solo queries a BD. Máx 30 líneas por función.

### Prohibido absolutamente:
- Lógica de negocio en endpoints
- Queries directas en endpoints
- Imports dentro de funciones (siempre al inicio del archivo)
- `print()` — nunca
- DELETE físico — siempre cancelar con trazabilidad

### Schemas:
- Todo input tiene schema Pydantic en `app/schemas/`
- Nunca schemas inline en endpoints
- Sufijos: `Create`, `Update`, `Read`

### Migraciones Alembic:
- Todo cambio de modelo requiere migración Alembic
- Campos nuevos en tablas con datos usan `server_default`
- Nunca modificar modelos sin migración correspondiente
- Respetar cadena down_revision

---

## REGLAS DE NEGOCIO KOLOKA

### Regla de oro:
Todo lo que se crea se puede corregir. Todo lo que se corrige se puede cancelar.
**Nada se elimina físicamente — siempre cancelar con trazabilidad.**

### 4 caminos por flujo (Claude los define ANTES de construir):
1. **Feliz** — todo sale bien
2. **Corrección** — error humano antes de efecto externo
3. **Excepción** — error después de efecto externo
4. **Cancelación** — acuerdo entre partes
Sin estos 4 caminos definidos y aprobados, no se construye el flujo.

### Todo lo que se crea tiene CRUD completo:
Todo registro creado en el sistema debe poder:
- Editarse — mientras no tenga efectos externos irreversibles
- Cancelarse — siempre, con motivo obligatorio y trazabilidad
- Nunca eliminarse físicamente — solo cancelación lógica

Sin CRUD completo definido, no se construye el módulo.

### Roles:
- DIRECTOR: acceso total
- MANAGER: finanzas + autorización OCs
- ADMIN: compras, proveedores, pagos (sin ejecutar)
- SALES: solo cotizaciones y ventas propias
- DESIGN: diseño e ingeniería
- PRODUCTION: producción y solicitudes de compra
- WAREHOUSE: compras y almacén
- LOGISTICS: logística e instalación

### Operaciones financieras:
Solo DIRECTOR, MANAGER y ADMIN.
SALES y roles operativos nunca tocan finanzas.

### Cancelaciones:
- Siempre con motivo obligatorio
- Siempre con VConfirmDialog mostrando consecuencias
- Siempre revertir saldos y registros ligados automáticamente
- Guardar: fecha, hora y usuario que canceló

---

## CHECKLIST OBLIGATORIO — ANTES DE REPORTAR LISTO

Quien programe (Claude Code o Cursor) ejecuta este checklist en TODO código nuevo o modificado.
Si algún punto falla, lo corrige antes de reportar.

### Frontend:
- [ ] Cero `<input>` directo
- [ ] Cero `<select>` directo
- [ ] Cero `<table>` directo
- [ ] Cero `alert()` y `window.confirm()`
- [ ] Cero `console.log/error/warn`
- [ ] Campos de entidades usan `SearchableSelect` con autocomplete
- [ ] Acciones destructivas usan `VConfirmDialog` con consecuencias visibles
- [ ] Listas vacías usan `VEmptyState`
- [ ] Botones deshabilitados mientras procesan
- [ ] Máximo 3 clics para llegar a cualquier acción
- [ ] Acciones universales solo con ícono y title; acciones de flujo o irreversibles con texto

### Backend:
- [ ] Cero lógica de negocio en endpoints
- [ ] Cero imports dentro de funciones
- [ ] Cero `print()`
- [ ] Schemas en `app/schemas/` (no inline)
- [ ] Operaciones financieras verifican rol (403 si no cumple)
- [ ] Cancelaciones usan flag, no DELETE
- [ ] Todo cambio de modelo tiene migración Alembic

### Pruebas:
- Si un test falla, se investiga la causa; nunca se relaja el test para que pase.
- Toda funcionalidad nueva se verifica también en pantalla, no solo por API.

---

## REFERENCIA COMPLETA
Ver `CLAUDE_FULL.md` en la raíz del proyecto para arquitectura detallada,
patrones de código, principios UX y ejemplos NUNCA vs SIEMPRE.
