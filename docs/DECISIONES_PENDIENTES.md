# Decisiones pendientes de Gabriel

Decisiones de negocio que no detienen el trabajo (CLAUDE.md §1). Gabriel las revisa en bloque.
Si la decisión es reversible se aplica la recomendación mientras tanto; si no, la tarea espera.

## Formato

```

## Pendientes

### D14. Saneamiento de producción — 2026-10-10 — ROADMAP tarea 7
- **Contexto:** `docs/SANEAMIENTO.md` (reporte de solo lectura): registros de prueba, OVs legacy con estados y saldos
  incorrectos, OVs con saldos descuadrados, pagos Fast-Track sin pago registrado, $2,397.72 de diferencia en Santander,
  materiales incompletos.
- **Preguntas para Gabriel / contabilidad:**
  1. OVs Finalizadas con parte sin facturar (OV-0115, 0117, 0128, 0129, 0130): ¿falta facturar o es fondo/descuento?
  2. OV-0045 vs OV-0123 (Puerto Palmeras): ¿cuál es la buena?
  3. ¿Qué OVs legacy debían ser exentas?
  4. Santander: ¿el estado de cuenta coincide con $243,109.92 o con $245,507.64?
  5. Regla de saldo de la OV para la herramienta: total − abonos vigentes (recomendado).
- **Recomendación:** aprobar el plan; Claude Code construye la herramienta de recálculo (punto 6.1) mientras contabilidad
  responde 1–4.
- **Reversible:** las correcciones se hacen con motivo y quedan en bitácora.
- **Estado:** pendiente

## Resueltas

### D<n>. <título corto> — <fecha AAAA-MM-DD> — <tarea del ROADMAP>
- **Contexto:** qué se encontró y por qué hace falta decidir.
- **Opciones:** A) … B) … C) …
- **Recomendación:** opción y por qué.
- **Reversible:** sí (aplicada la recomendación) / no (tarea en espera).
- **Estado:** pendiente | aprobada (<fecha>, opción) | rechazada (<fecha>, motivo)
```

### D8–D12. Plan del arranque en ceros (reemplazado por saneamiento) — 2026-10-10 — ROADMAP tarea 7
- **Contexto:** `docs/PLAN_ARRANQUE.md`. Producción ya se usa para operar (compras, recepciones, pagos, caja chica,
  inventario físico), así que el arranque no puede ser borrar todo.
- **Decisiones:** D8 qué es real hoy; D9 fecha de corte (recomiendo 31/10/2026); D10 lo de prueba se marca y oculta,
  no se borra; D11 multiempresa fuera del arranque; D12 saldos de apertura de CxP y bancos por Excel validado.
- **Recomendación:** la de cada punto en el documento.
- **Reversible:** no se aplica nada hasta la aprobación (tarea 7 en espera).
- **Estado:** resuelta (2026-10-10): D8 no hay arranque en ceros; todo lo de producción es real y se sanea con la regla de oro (docs/SANEAMIENTO.md). D9 sin fecha de corte. D10 nada se borra. D11 multiempresa fuera de alcance por ahora. D12 reemplazada por las herramientas de saneamiento.

### D13. Costos y márgenes visibles fuera de Finanzas — 2026-10-10 — ROADMAP tarea 6 (seguridad, lecturas)
- **Contexto:** la auditoría de lecturas (GET) ya se aplicó en lo seguro: bancos, CxC de todos, comisiones de otros,
  costos semanales y KPIs de costo quedan solo para DIRECTOR/MANAGER/ADMIN; cotizaciones, OVs y cobros para
  DIRECTOR/MANAGER/ADMIN y Ventas (solo lo suyo, incluidos PDF, abonos y comisiones). Quedan datos que hoy ven otros
  roles y que cortar requiere quitar campos de la respuesta (no bloquear la ruta):
  1. Ventas ve costo congelado, costo de receta y sobreprecio de sus propias cotizaciones/OVs.
  2. Ventas y operativos ven `current_cost` de materiales y costo estimado de recetas en el catálogo de diseño.
  3. Producción y Diseño ven montos de OCs y requisiciones (las necesitan para conteos de su tablero).
  4. `/foundations/config` (metas de venta, tarifas de instaladores, sobreprecio objetivo) lo carga todo rol.
  5. `/users/` muestra comisión y meta de ventas de cada usuario a todos.
  6. Almacén ve la valuación en dinero y el kárdex con costos.
- **Opciones por punto:** A) quitar el campo para quien no lo necesita (respuesta reducida). B) dejarlo como está.
- **Recomendación:** A en 4 y 5 (datos de la empresa y de personas); A en 2 para Ventas solo si el precio de la
  cotización se calcula en el servidor (hoy el navegador lo calcula con el costo); B en 1, 3 y 6 (los usan para trabajar).
- **Reversible:** sí, pero no aplicado (cambia lo que muestran varias pantallas).
- **Estado:** resuelta (2026-10-10): el vendedor (SALES) solo ve precio de venta, nunca costos ni márgenes, en ninguna pantalla ni PDF. Puntos 3–6 sin cambio; 4 y 5 se reducen para roles sin acceso.

### D2. Títulos de pantalla: sin color o un color por módulo — 2026-10-10 — ROADMAP tarea 4
- **Contexto:** al aprobar D1 la elección de títulos llegó sin resolver ("[sin color, un solo estilo / conservar
  un color por módulo]").
- **Opciones:** A) sin color, un solo estilo (`text-slate-800`). B) conservar un color por módulo.
- **Recomendación:** A. Hoy solo Finanzas tiene títulos de color y no siguen una regla (azul, índigo y verde en
  el mismo módulo); el módulo ya se distingue por el menú y el ícono.
- **Reversible:** sí (aplicada la recomendación en la guía; cambiarla es una clase por pantalla).
- **Estado:** aprobada (2026-10-10, A): títulos con un solo estilo, sin color por módulo. Aplicado también en Finanzas.

### D3. Estado "Finalizada" de la OV — 2026-10-10 — ROADMAP tarea 6
- **Contexto:** la OV pasa a FINISHED cuando su saldo llega a cero, aunque la obra siga en producción o instalación;
  la pantalla decía "Finalizada Cerrada" y se leía como obra terminada.
- **Opciones:** A) solo cambiar la etiqueta a "Pagada (saldo cero)". B) FINISHED solo cuando el saldo es cero Y todas
  las instancias tienen firma de conformidad (cambia la lógica y los reportes que filtran por FINISHED).
- **Recomendación:** A ahora (no cambia lógica); B si Gabriel quiere que "Finalizada" signifique obra entregada.
- **Reversible:** sí (aplicada A: etiqueta "Pagada (saldo cero)" en el monitor de Ventas).
- **Estado:** aprobada (2026-10-10, A): "Pagada (saldo cero)".

### D4. IVA de las órdenes de compra — 2026-10-10 — ROADMAP tarea 6
- **Contexto:** la OC no guarda tasa de IVA; "Todas las OCs" y el detalle calculan el total con 16% fijo. La recepción
  sí pide la tasa (16%, 8% o 0%), así que una OC exenta o de frontera se ve con un total equivocado hasta recibirse.
- **Opciones:** A) agregar tasa de IVA a la OC (por defecto 16%, editable al emitir; migración con 0.16 en las
  existentes). B) dejar 16% fijo en la OC y que solo la factura/recepción lleve la tasa real.
- **Recomendación:** A.
- **Reversible:** no aplicado (requiere migración); la tarea sigue con lo demás.
- **Estado:** aprobada (2026-10-10, A): agregar la tasa de IVA a la OC con migración (en implementación).

### D5. Valor del inventario en el tablero de Inventario — 2026-10-10 — ROADMAP tarea 6
- **Contexto:** el tablero mostraba $2,259,249.11 (suma de existencias incluyendo negativas, sin producción en
  proceso) y Valuación $2,283,776.16 (materia prima positiva + en proceso + terminado).
- **Opciones:** A) el tablero muestra el mismo total que Valuación; Almacén ve "—" porque la valuación es solo para
  Dirección, Gerencia y Administración (decisión del PLAN 1). B) mantener un número propio para Almacén.
- **Recomendación:** A.
- **Reversible:** sí (aplicada A).
- **Estado:** aprobada (2026-10-10, A).

### D6. Quién administra usuarios — 2026-10-10 — ROADMAP tarea 6 (seguridad)
- **Contexto:** crear, editar y borrar usuarios no revisaba rol: cualquier usuario con sesión podía crear un DIRECTOR,
  cambiar el rol o la contraseña de otro, o borrarlo. Está así en producción hasta el próximo push.
- **Opciones:** A) DIRECTOR y ADMIN administran usuarios; cada quien cambia solo su nombre, teléfono y contraseña.
  B) solo DIRECTOR. C) DIRECTOR y MANAGER.
- **Recomendación:** A (es lo que el código ya sugería con la meta mensual: ADMIN y DIRECTOR).
- **Reversible:** sí (aplicada A). "Eliminar" pasa a "Dar de baja" con motivo obligatorio (nunca se borra).
- **Estado:** resuelta (2026-10-10): solo DIRECTOR crea y administra usuarios (aplicado).

### D7. Matriz de permisos por rol (auditoría de seguridad) — 2026-10-10 — ROADMAP tarea 6
- **Contexto:** la auditoría encontró 20 rutas sin sesión y ~50 escrituras sin revisión de rol (tesorería,
  pagos, facturación a clientes, comisiones, compras, inventario). Cualquier usuario con sesión —y en algunas,
  cualquiera sin sesión— podía mover dinero entre cuentas, ejecutar pagos, marcar comisiones pagadas o recibir
  mercancía. Está así en producción hasta el próximo push.
- **Aplicado (grupos en `app/core/permissions.py`):**
  | Grupo | Roles | Rutas |
  |---|---|---|
  | Finanzas | DIRECTOR, MANAGER, ADMIN | movimientos y abonos bancarios, solicitudes de pago, cancelar factura de proveedor, facturar a clientes, abonos, anticipos, marcar vendida, corrección de recepción, solicitar anticipo de OC, consultas de CxP |
  | Ejecutar dinero | DIRECTOR, MANAGER | ejecutar pago, transferencias, crear cuentas bancarias, pagar/diferir comisiones |
  | Compras | DIRECTOR, MANAGER, ADMIN, WAREHOUSE | emitir/editar/cancelar/recibir OCs, PDF de OC |
  | Requisiciones | Compras + PRODUCTION, DESIGN | crear/editar/cancelar requisiciones, listas de compras |
  | Almacén | DIRECTOR, MANAGER, ADMIN, WAREHOUSE | productos terminados y su existencia |
  | Cancelar OV | DIRECTOR, MANAGER | cancelar orden de venta |
  | Producción | DIRECTOR, MANAGER, ADMIN, PRODUCTION, DESIGN | etiquetas, piedra, listo, impresión |
  | Planeación | DIRECTOR, MANAGER, ADMIN, PRODUCTION, DESIGN, LOGISTICS | reprogramar, cerrar, reabrir garantía |
  | Instalación | DIRECTOR, MANAGER, LOGISTICS | marcar instalado (alimenta nómina) |
  | Campo | DIRECTOR, MANAGER, LOGISTICS, PRODUCTION, DESIGN | firma del cliente |
  | Nómina de instaladores (consulta) | DIRECTOR, MANAGER, ADMIN | |
- **Puntos a confirmar:** Ventas ya no puede reprogramar en Planeación ni cancelar su OV; Administración no ejecuta
  pagos ni transfiere (CLAUDE.md: "pagos (sin ejecutar)"); Producción ya no emite OCs (solo requisiciones).
- **Reversible:** sí (aplicada; cambiar un grupo es una línea).
- **Estado:** resuelta (2026-10-10, aplicado): cancelar OV DIRECTOR/MANAGER; planear y reprogramar solo DIRECTOR o DESIGN (Ventas no); ejecutar pagos solo DIRECTOR — MANAGER con el interruptor "Gerencia puede ejecutar pagos" en Parámetros Globales (apagado; solo DIRECTOR lo cambia); ADMIN solicita, no ejecuta; PRODUCTION solo requisiciones.

### D1. Aprobar la guía de pantallas — 2026-10-10 — ROADMAP tarea 3
- **Contexto:** `docs/GUIA_PANTALLAS.md` (propuesta) fija contenedor, encabezado, tarjetas, filtros, tablas,
  botones, modales y formatos con base en las mejores pantallas actuales (Valuación, Kárdex, Importación legacy,
  Proveedores, Bitácora). Hoy conviven 3 estilos de título, 4 colores de botón primario y ~25 formatos de moneda.
- **Puntos que más se notan para el usuario:**
  1. Un solo color primario (indigo); verde solo para crear, recibir, cobrar y pagar.
  2. Moneda siempre `$1,234.56` / `-$60.00` (hoy varias pantallas muestran formato MXN de es-MX).
  3. Títulos sin color por módulo (Finanzas hoy los tiene en azul, índigo o verde).
  4. Rayos X se divide al rediseñarlo (hoy abre hasta 9 ventanas una sobre otra).
- **Opciones:** A) aprobar tal cual. B) aprobar con cambios (indicar cuáles). C) rechazar.
- **Recomendación:** A. Se aplica por módulo (ROADMAP tarea 4), empezando por Ventas, Inventario y Compras.
- **Reversible:** no se aplica a pantallas existentes hasta aprobarla (tarea 4 en espera).
- **Estado:** aprobada (2026-10-10, A): un color primario y verde solo para crear/recibir/cobrar/pagar;
  moneda `$1,234.56` / `-$60.00`; Rayos X dividido. Títulos: ver D2.
