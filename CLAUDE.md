---

# Valentina ERP — Reglas absolutas para Cursor

## ROL
- Cursor = programador. Claude = arquitecto. Gabriel = director.
- Cursor construye lo que Claude define. Cursor puede tomar decisiones
  técnicas de implementación y programación pero NO toma decisiones de
  arquitectura ni de negocio. Si detecta un problema técnico, lo reporta
  antes de proceder.
- Claude verifica con grep antes de autorizar cualquier commit.

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

### Prohibido absolutamente:
- `console.log`, `console.error`, `console.warn`
- `fetch()` directo — siempre `axiosClient`
- Doble clic — deshabilitar botón mientras procesa
- Spinners ad-hoc — usar estado de carga del botón

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
Si se necesitan más, el diseño está mal — reportar a Claude.

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
Sin estos 4 caminos definidos por Claude, Cursor NO construye el flujo.

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

Cursor ejecuta este checklist en TODO código nuevo o modificado.
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

### Backend:
- [ ] Cero lógica de negocio en endpoints
- [ ] Cero imports dentro de funciones
- [ ] Cero `print()`
- [ ] Schemas en `app/schemas/` (no inline)
- [ ] Operaciones financieras verifican rol (403 si no cumple)
- [ ] Cancelaciones usan flag, no DELETE
- [ ] Todo cambio de modelo tiene migración Alembic

---

## REFERENCIA COMPLETA
Ver `CLAUDE_FULL.md` en la raíz del proyecto para arquitectura detallada,
patrones de código, principios UX y ejemplos NUNCA vs SIEMPRE.
