# Buzón del asesor de Gabriel

Instrucciones del asesor para Claude Code. Se ejecutan siguiendo `CLAUDE.md` (misma autoridad que las de Gabriel
dentro de esas reglas; nada de producción fuera de lo que CLAUDE.md permite).

Formato: una instrucción por viñeta en "Pendientes". Al terminarla, Claude Code la mueve a "Hechas" con fecha, hora
(Mérida) y resultado breve.

## Pendientes

- [2026-10-16 15:50] D42 PANTALLAS MODELO PARA LA TERCERA OLA (Gabriel 15:47). Hacer después de D41 y D21.
  Gabriel vio /director/legacy-import y NO le gusta. Las que SÍ le gustan y quedan como modelo:
  - Gerencia → CxC → Antigüedad de saldos (/finance/aging, AgingReportPage)
  - Gerencia → CxC → Cobranza (/finance/cxc-report, CxcReportPage)
  1. Antes de tocar nada: en "Hechas" describe en lenguaje sencillo qué tienen esas dos que no tiene legacy-import
     (encabezado, tarjetas, filtros, tabla, agrupado, colores, tamaños, botones), con capturas si puedes.
  2. Actualiza docs/GUIA_PANTALLAS.md: el modelo son esas dos; todo lo que la guía diga y no coincida con ellas, se ajusta
     a ellas (lo que Gabriel aprobó es lo que ve, no la guía).
  3. Ajusta docs/REVISION_PANTALLAS_OLA3.md con el nuevo modelo (puede cambiar qué pantallas cumplen).
  4. NO apliques la tercera ola: Gabriel aprueba primero la guía actualizada.
  Lo que a Gabriel le gusta de Cobranza (/finance/cxc-report), 15:49 — son reglas de la guía: los COLORES, la UBICACIÓN de
  los botones, la CLARIDAD y LÓGICA (orden de la información) y el TAMAÑO DE LETRA. Que la guía los describa con
  precisión (clases y valores exactos tomados de esa pantalla) para copiarlos igual en las demás.

- [2026-10-16 15:45] D21 APROBADA (Gabriel 15:43): construir la ruta "Lo pone el cliente" con el material "PIEDRA DEL CLIENTE"
  (m², costo $0 fijo, sin compra, sin existencia, sin faltante en Simulador, sin descarga; sí lote de piedra, carril,
  manifiesto y nómina). NO clonar las 4 recetas Nadira 33 ahora: se clonan cuando se vuelva a vender (Gerardo da los m²).
  Hacer DESPUÉS de D41. Tercera ola: ESPERA, Gabriel quiere ver primero la pantalla modelo antes de aprobar el diseño.

## Preguntas para el asesor

- [2026-10-16 15:44] D41, dudas que NO cambié:
  1. Caja chica: hoy Gerencia la OPERA (registra, edita, cancela movimientos y configura el fondo); Administración
     registra pero no configura el fondo. ¿Dejo a Gerencia solo en ver, y configurar el fondo a DIRECTOR y ADMIN?
  2. Pagar nómina de cuadrillas y comisiones: Gerencia ve el botón, pero la API solo la deja con el interruptor
     encendido (hoy apagado). ¿Ocultamos el botón a Gerencia, o se queda para cuando se encienda?
  3. Autorizar solicitudes de pago a proveedor: la API aún deja a Gerencia autorizar (sin pagar). En pantalla hoy
     autorizar va junto con pagar, así que no lo puede usar. ¿Se le quita también?
  4. El interruptor "Gerencia puede ejecutar pagos" ya no abre pagos a proveedores ni Bancos; solo nómina y comisiones.
  RESUELTA [16/10 17:06]: Gabriel aprobó las 3 (Gerencia solo ve caja chica, no paga nómina ni comisiones, no autoriza
  pagos a proveedor). Aplicadas 17:18 (ver Hechas).

- [2026-10-15 12:40] D35 (de H46). En Pendiente de Facturar el total suma anticipos con IVA y avances de obra sin
  IVA. Recomiendo (A) avances también con IVA, para que el total sea lo que se factura. Cambia cifras de Cobranza, así
  que no lo apliqué. ¿A, B (todo sin IVA) o C (dejarlo con la etiqueta)?
  RESPUESTA DEL ASESOR [12:52]: no apliques nada todavía; lo decide Gabriel a su regreso. Está ligado a otra pregunta
  que le hice en el paso 13: si la factura de avance es la casa completa con el anticipo proporcional aplicado, o solo
  el 40% restante. Mientras, deja C (etiqueta). Prepara para Gabriel, sin aplicar, qué cifra mostraría "Registrar Avance"
  para Piloto 1 en cada caso (casa completa $18,411.01 c/IVA con anticipo aplicado, o $7,364.40 c/IVA) y qué hace hoy el código.
  PREPARADO PARA GABRIEL [15/10 13:04] (nada aplicado; se queda C, la etiqueta):
  - Piloto 1: partida $15,871.56 sin IVA = $18,411.01 con IVA. OV-0157 con anticipo del 60% (pagado $33,139.82, folio
    A-PILOTO-1); la parte de Piloto 1 es $11,046.61 con IVA.
  - Qué hace HOY el código: "Registrar Avance" NO calcula ninguna cifra. Muestra la casa a $15,871.56 (sin IVA), el
    campo "Importe de la factura (con IVA)" va vacío y se escribe a mano; manda anticipo amortizado = 0 y sin nota de
    crédito. El saldo por cobrar de esa factura = importe − anticipo amortizado − cobros − notas.
  - Caso 1, factura de la casa completa con el anticipo aplicado: la factura sería $18,411.01; amortizado $11,046.61;
    por cobrar $7,364.40. HOY: si se escribe $18,411.01, Valentina pide cobrar $18,411.01 (sobra $11,046.61, porque
    la pantalla no captura el anticipo amortizado). Para este caso hay que agregar el cálculo y el campo de amortización
    (o la nota de crédito del anticipo).
  - Caso 2, factura solo del 40% restante: la factura sería $7,364.40 y se cobra $7,364.40. HOY funciona si se
    escribe $7,364.40 a mano; solo faltaría prellenarla (casa × 1.16 × (1 − % anticipo)).
  - En ambos casos el renglón de la lista y el total de "Avances" siguen sin IVA ($15,871.56); con D35-A pasarían a
    con IVA ($18,411.01) o a lo que falta facturar ($7,364.40 en el caso 2).
  - Recomendación técnica: la que use Compaq. Si el anticipo se amortiza en la factura (caso 1), prellenar
    $18,411.01 y amortizado $11,046.61; si no, prellenar $7,364.40.
  RESUELTA [15/10 16:15]: Gabriel decidió D36 (casa completa con anticipo aplicado) y D35-A. Aplicadas (16:24).

- [2026-10-14 13:27] SUBIR A PRUEBAS EN HORARIO LABORAL. Prioridad 1 corregida y con tests: H38 (502aaea), D32 (7a66fc0)
  y H37 (66dda73).
  Pruebas despliega de la rama `main`, igual que producción: subirlo a Pruebas = subirlo también a producción. Son
  las 13:27 (horario laboral) y CLAUDE.md no permite push sin autorización de Gabriel. Además, el push llevaría 5
  commits del 14/10 que aún no prueba en pantalla (Costo_OV, #receta, ayuda "?", guía segunda ola).
  Opciones: (a) Gabriel autoriza el push ahora (todo a producción y Pruebas); (b) esperar a las 18:04;
  (c) Gabriel cambia en Render la rama de valentina-pruebas-api y valentina-pruebas a una rama `pruebas`, y desde
  entonces subo ahí primero sin tocar producción. Recomiendo (c) desde ahora (es lo que pide "probar en Pruebas
  antes de producción") y, para hoy, (a) si el ensayo no puede esperar.
  También: la sesión de la copia local venció (403); para probar en pantalla, Gabriel debe entrar en
  http://localhost:3000.
  RESPUESTA DEL ASESOR [13:40]: Gabriel salió; no hay push hasta que él decida. No subir nada ahora.
  - Le planteo (a)/(b)/(c) a su regreso; (c) es cambio en Render y lo decide él.
  - Mientras tanto: sigue con el resto de la instrucción (D30 ya va; luego D31, simulador/compras/almacén,
    producción/etiquetas, ventas) en commits locales, con tests. Deja la prueba en pantalla para cuando Gabriel
    entre en localhost:3000.
  - Agrega a tu reporte final la lista de commits pendientes de prueba en pantalla.

## Hechas

- [2026-10-16 17:06] RESPUESTAS A LAS 3 DUDAS DE D41 (Gabriel 17:04, aprobadas las 3). Cambio mínimo, en `pruebas`.
  1. Caja chica: Gerencia (MANAGER) SOLO VER (no registra, no edita, no cancela, no configura el fondo). Operan:
     Administración (registra) y Dirección; el fondo lo configuran Dirección y Administración.
  2. Pagar nómina de cuadrillas y comisiones: ocultar el botón "Pagar" / "Pagar todo" a Gerencia (y bloquear en backend
     aunque se encienda el interruptor). Paga Dirección (Alejandrina).
  3. Autorizar solicitudes de pago a proveedor: quitárselo a Gerencia también en backend.
  Actualiza la tabla de antes/después en "Hechas" y la ayuda "?" si menciona algo de esto. Luego sigue con D21 y D42.
  HECHO [16/10 17:18, Pruebas]: aplicadas las 3 respuestas. Tabla de antes y después (MANAGER = Gerencia):
  | Acción | ANTES (después de D41 15:44) | AHORA |
  |---|---|---|
  | Caja chica: ver fondo y movimientos | sí | sí (sin cambio) |
  | Caja chica: registrar egreso o reposición, editar, subir comprobante | Gerencia sí | no lo ve · API 403. Registra Administración o Dirección |
  | Caja chica: cancelar movimiento | Dirección y Gerencia | solo Dirección |
  | Caja chica: configurar fondo | Dirección y Gerencia | Dirección y Administración |
  | Pagar nómina de cuadrillas ("Pagar", "Pagar todo") | ve el botón · API con interruptor | no lo ve · API 403 aunque se encienda |
  | Pagar comisiones ("Pagar", "Pagar todo", "Diferir / Omitir") | ve el botón · API con interruptor | no lo ve · API 403 aunque se encienda |
  | Autorizar o rechazar solicitud de pago a proveedor | API sí (pantalla no) | API 403; solo Dirección |
  | Interruptor "Gerencia puede ejecutar pagos" (Configuración) | abría nómina y comisiones | ya no abre nada: se quitó de Configuración (el dato queda en la base, sin efecto) |
  Mensajes: "Caja chica la operan Administración y Dirección; Gerencia solo la consulta (D41)." y "Solo Dirección
  ejecuta pagos; Gerencia no paga (D41)." Gerencia sigue viendo las bandejas de Nómina y Destajos (y diferir destajos).
  Ayuda "?": en Pagar comisiones y Pagar la nómina de cuadrillas dice "Solo Dirección paga; Gerencia ve la lista".
  Tests: 2 nuevos (caja chica y pagos); backend y frontend en verde, build OK.

- [2026-10-16 15:32] AUDITORÍA DEL ROL GERENCIA (Karina, contabilidad@incamex.com) — SOLO LECTURA, sin cambiar nada.
  Contexto (Gabriel 15:25): Alejandrina García (rol DIRECTOR) maneja Bancos: registra cobros y pagos. Karina (Gerencia)
  por ahora NO debe operar Bancos; más adelante sí. Karina sí registra facturas (anticipo y avances).
  Entrega en "Hechas" una tabla: pantalla/acción → ¿lo puede ver MANAGER? → ¿lo puede hacer MANAGER? (frontend Y backend),
  para: 2. Bancos (saldos y movimientos), Registrar Ingreso/cobros, abonos desde la OV, pagos a proveedores, Caja chica,
  Nómina de cuadrillas (Pagar), Comisiones (Pagar), Pendiente de Facturar (registrar facturas), conciliación, cancelar
  movimientos. Confirma también el rol real de contabilidad@incamex.com y de Alejandrina en la BD de Pruebas.
  Con la tabla, Gabriel decide qué se le cierra a MANAGER (D41). Hazlo antes que D21 y la tercera ola.
  D41 DECIDIDA (Gabriel 15:33) — cambio MÍNIMO, nada radical, no muevas pantallas ni roles de los demás:
  - MANAGER (Gerencia/Karina) NO ve el módulo de Bancos ni saldos de bancos (tarjeta "2. Bancos" y cualquier saldo
    bancario en tableros), NO registra cobros de clientes (Registrar Ingreso, Abono, Cobrar) y NO registra pagos a
    proveedores. Bloquéalo en frontend (ocultar) Y backend (403 con mensaje claro).
  - Eso lo hace solo Alejandrina García, ale.garcia@incamex.com, rol DIRECTOR (confirma en la BD de Pruebas).
  - Caja chica: la opera Administración (ADMIN); Gerencia SÍ puede verla (solo ver). Si hoy MANAGER la opera, dímelo
    en la tabla antes de cambiarlo.
  - Todo lo demás de MANAGER queda igual (registrar facturas, CxC, reportes, Nómina de Gerencia, etc.). Si encuentras
    algo dudoso (p. ej. pagar nómina/comisiones), NO lo cambies: anótalo en "Preguntas para el asesor".
  - Entrega la tabla de antes y después en "Hechas". Trabajar en `pruebas`.
  HECHO [16/10 15:44, Pruebas]:
  Roles confirmados (Pruebas y producción, solo lectura): contabilidad@incamex.com = CP. Karina Rivera, MANAGER;
  ale.garcia@incamex.com = Lic. Alejandrina García, DIRECTOR. El interruptor "Gerencia puede ejecutar pagos" está
  APAGADO en Pruebas y en producción.
  | Pantalla / acción | ANTES: ¿lo ve MANAGER? / ¿lo hace? (pantalla · API) | DESPUÉS (D41) |
  |---|---|---|
  | Gerencia → 2. Bancos (saldos y movimientos) | no la ve (solo DIRECTOR) · la API sí le daba cuentas y movimientos | no · API 403 |
  | Saldos bancarios en tableros | Tesorería cargaba las cuentas para MANAGER (no mostraba el total) · tablero de Dirección solo DIRECTOR | no se cargan · API 403 |
  | Registrar Ingreso / depósito a varias facturas | botón dentro de Bancos (no lo veía) · API sí lo permitía | no · API 403 |
  | Abono desde la OV (registrar, corregir, cancelar) | sí · sí | no lo ve · API 403 |
  | Cobrar (reporte de CxC) y "Registrar Cobro" de retención | sí · sí | no lo ve · API 403 |
  | Corregir / cancelar movimiento bancario | dentro de Bancos · API sí (DIRECTOR y MANAGER) | API solo DIRECTOR |
  | Pagos a proveedores: solicitar pago / pago urgente | sí (quedaba como solicitud) · sí | no lo ve · API 403 |
  | Pagos a proveedores: ejecutar | no (interruptor apagado) · con interruptor sí | no, aunque se encienda el interruptor · API 403 |
  | Alta de cuenta y traspaso entre cuentas | no (interruptor apagado) · con interruptor sí | no, aunque se encienda · API 403 |
  | Caja chica | SÍ LA OPERA: registra, edita y cancela movimientos, y es de los únicos que configura el fondo (DIRECTOR y MANAGER) | SIN CAMBIO (ver Preguntas) |
  | Nómina de cuadrillas (Pagar) | ve el botón · API solo con interruptor (hoy no) | sin cambio (ver Preguntas) |
  | Comisiones (Pagar) | ve el botón · API solo con interruptor (hoy no) | sin cambio (ver Preguntas) |
  | Pendiente de Facturar (registrar facturas de anticipo y avance) | sí · sí | sin cambio |
  | Conciliación bancaria | no hay pantalla de conciliación; los movimientos se corrigen en Bancos | ver arriba |
  | CxC, reportes, Nómina de Gerencia (ver), facturas de proveedor | sí · sí | sin cambio |
  ADMIN y DIRECTOR quedan como estaban. Mensaje del 403: "Bancos, cobros y pagos a proveedores los registra
  Dirección; Gerencia no los opera (D41)." Dos pruebas viejas decían lo contrario (Gerencia solicita pagos a proveedores y
  con el interruptor los ejecuta); se actualizaron a D41. Tests backend 364, frontend 48, build OK.
  Probado en pantalla en Pruebas solo como Dirección (que todo siga igual); como Gerencia no, porque no tengo sesión de
  Karina: las pruebas automáticas cubren los 403.

- [2026-10-16 15:25] PARA DESPUÉS DE D40/H70/AYUDA (no urgente).
  A. D21 RESUELTA (Gabriel 15:21): en las recetas Nadira 33 de VEINTE VEINTITRES CONSTRUCTORA (#197 COCINA NADIRA GRANITO,
     #201, #202, #231) la PIEDRA LA PUSO EL CLIENTE. Propón cómo modelar "material que pone el cliente": no se compra, no
     tiene costo para Koloka, no exige existencia en el Simulador ni descarga de almacén, pero sí lleva carril de piedra
     para producción/instalación (INSTALAGRANITO y su nómina). Pasa D21 a Resueltas con tu propuesta; no cambies recetas
     ya vendidas sin visto bueno.
  B. TERCERA OLA DE LA GUÍA DE PANTALLAS (Gabriel 15:21: "unificar todas las pantallas con un solo diseño" es requisito
     antes de pasar a `main`). Revisa TODAS las rutas contra docs/GUIA_PANTALLAS.md y entrega primero (sin cambiar código)
     una lista: pantalla → qué no cumple. Vistas en el ensayo que no cumplen: Compras (Nueva Solicitud, Mesa de Control /
     Freno, Centro de Despacho en mayúsculas y otro estilo), Andén de Descarga y su recepción, Piso de Producción
     (encabezado distinto), Centro de impresión, Campo (celular), Nómina de Gerencia ("5. Nómina" con "Use «Regresar»…").
     Con la lista aprobada por Gabriel se aplica pantalla por pantalla en `pruebas`.
  HECHO [16/10 15:31] (solo documentos, sin código):
  A. D21 pasada a Resueltas con la propuesta: ruta nueva CLIENTE + material "PIEDRA DEL CLIENTE" (categoría piedra, m²,
     costo $0 bloqueado; sin compra, existencia, Simulador ni descarga). Las recetas Nadira ya llevan MAQGRANITO e
     INSTALAGRANITO, así que con esa línea entran a lote de piedra, carril PP/IP, manifiesto y nómina como cualquier piedra.
     Las 4 recetas vendidas solo se clonan con visto bueno de Gabriel (y los m² por casa de Diseño). Nada aplicado.
  B. Lista completa en docs/REVISION_PANTALLAS_OLA3.md: 50 pantallas revisadas; 2 cumplen, 6 con observación menor,
     42 no cumplen. Las del ensayo están confirmadas (Compras en mayúsculas y otro estilo, Andén y su recepción, Piso de
     Producción, Centro de impresión, Campo, Gerencia con "Use «Regresar»…"). Propongo empezar por los componentes base
     (Modal sin "custom", VTable con vacío y carga, encabezado y "Regresar" de los hubs) y luego las pantallas del ensayo.
     Espera aprobación de Gabriel para empezar.

- [2026-10-16 14:22] D40 MEDIO DE PAGO "EFECTIVO DIRECCIÓN" PARA COMISIONES (Gabriel 14:20). Hacer antes que D39/H70 y la ayuda.
  Gabriel paga las comisiones en efectivo desde una caja propia fuera de registro; hoy "Efectivo" usa Caja chica y marca
  "saldo insuficiente".
  - Al pagar comisión (renglón y "Pagar todo a <asesor>"), tercer medio: "Efectivo Dirección" (solo rol DIRECTOR).
    Marca la comisión pagada con fecha, monto, quién y medio en la bitácora; NO crea movimiento de banco ni de caja chica.
  - LO IMPORTANTE (Gabriel): el pago debe quedar como COSTO de la OV: que la comisión pagada cuente en la rentabilidad real
    de la OV y en los reportes de costos/gastos (y tablero de Dirección), igual que si se pagara por Banco. Revisa dónde se
    suma hoy la comisión y confirma que este medio entra igual.
  - Banco (cuenta) y Efectivo (Caja chica) se quedan como están (D37).
  - Reporte en "Hechas": dónde se ve la comisión pagada como costo para OV-0157.
  - AMPLIACIÓN (Gabriel 14:24): "Efectivo Dirección" también en la NÓMINA DE CUADRILLAS (renglón y "Pagar todo a <persona>"),
    mismas reglas: solo DIRECTOR, sin movimiento de banco ni caja chica, con bitácora, y el pago cuenta como COSTO de la
    instalación de esa OV (rentabilidad real y reportes), igual que por Banco.
  - PAGO DIVIDIDO (Gabriel 14:25): hay semanas en que una parte se paga por Banco y otra de Efectivo Dirección. En la
    confirmación de pago (renglón o "Pagar todo a <persona>") permitir dividir el total en varios medios (p. ej. Banco
    Santander $2,000 + Efectivo Dirección $1,200 = $3,200); la suma debe ser exactamente el total. Banco crea su
    movimiento por su parte; Efectivo Dirección solo bitácora; Caja chica su movimiento. El costo de cada renglón
    (instalación/comisión) es su monto completo, sin importar el medio. Aplica a nómina de cuadrillas y a comisiones.
  HECHO [16/10 14:39, Pruebas]:
  - Tercer medio "Efectivo Dirección" en comisiones (renglón, "Pagar todo a <asesor>" y la ventana de la OV) y en la
    nómina de cuadrillas (renglón y "Pagar todo a <persona>"). Solo lo ve y lo puede usar DIRECTOR (otro rol: 403). Marca
    pagado con fecha, quién y medio; bitácora "Pagó comisión/nómina $X a <persona> (Efectivo Dirección $X)"; no crea
    movimiento de banco ni de caja chica.
  - Pago dividido: en la confirmación, "Dividir pago" agrega medios (hasta 3: Banco con una cuenta, Caja chica, Efectivo
    Dirección), cada uno con su monto; no deja confirmar hasta que la suma cuadre exacto ("Faltan $…"/"Sobran $…").
    Banco y Caja chica crean su movimiento por su parte. El renglón guarda el desglose ("Banco · Santander $2,000.00 +
    Efectivo Dirección $1,200.00") y se ve en el histórico de pagos.
  - COSTO (lo importante): en Valentina el costo de la OV NO sale del pago, sale de la venta. La comisión es costo desde que
    se vende: comisión de la OV = % × venta sin IVA, y se resta en "Margen neto % sobre venta". La instalación es costo por
    la receta (renglón INSTALACOCINA / INSTALAGRANITO). Por eso Banco, Caja chica y Efectivo Dirección cuentan igual: el
    medio de pago no cambia ningún costo. Ningún reporte de costos o gastos suma movimientos de banco de comisiones.
  - OV-0157 en Pruebas: venta sin IVA $47,614.68; costo de partidas $31,195.71; comisión $2,380.73 (5%, igual a la suma de
    sus 4 comisiones: $1,428.44 + 3 × $317.43). Dónde se ve: ventana de la OV (Rayos X) → "Comisión incluida" y "Margen
    neto % sobre venta"; tablero de Dirección → Rentabilidad (venta − costo − comisión).
  - Ayuda de Gerencia actualizada (Efectivo Dirección y Dividir pago). Migración b7c8d9e0f1a2 (desglose del pago).
  Tests backend 363, frontend 48, build OK; migraciones probadas en local.

- [2026-10-16 14:16] H70 IMPORTANTE ANTES DE PASAR A `main`: COMISIONES VIEJAS QUE AHORA SALEN "POR PAGAR". NO cambies nada aún.
  Tras H67, en Gerencia → 5. Nómina → Comisiones, "B. Por pagar" subió a $74,202.75 (antes $952.29) y "A. Retenidas" bajó de
  $137,498.90 a $64,248.45: aparecen comisiones de OVs reales copiadas de producción (OV-0054, 0038, 0039, 0020, 0041,
  0156…) con "Pagar todo a Ing. Gabriel Frías (7 · $35,341.85)" y "Lic. Gabriel Frías García (7 · $38,560.89)".
  Riesgo: en producción esas comisiones pudieron pagarse fuera de Valentina (D24: comisiones fuera del Excel de migración)
  y se pagarían dos veces.
  Prepara (solo lectura) en "Hechas" una tabla: OV, factura, tipo, asesor, monto, fecha del cobro, cuál regla la liberó
  (la de antes o H67), y cuántas serían en PRODUCCIÓN con el mismo criterio. Propón opciones (p. ej. fecha de corte: todo
  cobro anterior a <fecha> se marca "pagada fuera de Valentina", sin movimiento, con bitácora; o revisión una por una con
  Karina). Gabriel decide. Hasta entonces el pase a `main` queda detenido.
  DECISIÓN D39 (Gabriel 14:17): TODAS las comisiones existentes ya fueron pagadas fuera de Valentina. Sin prisa.
  Al pasar a `main` (y también ahora en Pruebas, excepto las 4 de OV-0157): una migración marca como "pagada fuera de
  Valentina" toda comisión cobrada antes del pase, sin movimiento de banco ni caja, con bitácora y motivo "D39: pagada
  antes de Valentina". Desde el pase, las comisiones nuevas siguen el flujo normal (Por pagar → Pagar con Banco/Efectivo).
  Ya no hace falta la tabla de análisis; solo reporta cuántas y qué total marcó en Pruebas y cuántas marcaría en producción.
  HECHO D39 [16/10 14:39, Pruebas]: migración a6b7c8d9e0f1. Marca toda comisión no pagada como "Pagada fuera de Valentina"
  (is_paid, medio OUTSIDE, fecha), sin movimiento de banco ni caja, con 2 renglones de bitácora por comisión (pagada y medio)
  y motivo "D39: pagada antes de Valentina". Respeta la obra piloto (cliente OBRA PILOTO, que solo existe en Pruebas).
  - Pruebas: 55 comisiones por $185,383.50 (18 de vendedor $91,057.08 y 37 de Dirección global $94,326.42). Las 12 de
    OV-0157 (4 de vendedor por $2,380.73 y 8 de Dirección global) siguen igual.
  - PRODUCCIÓN, si se pasara hoy: las mismas 55 por $185,383.50. Ojo: también marca las 37 de "Dirección global" (la
    instrucción dice "toda comisión"); si esas no se pagaban, dímelo antes del pase.
  - Al pasar a `main` marca lo que haya sin pagar en ese momento; lo que se cobre después sigue Por pagar → Pagar.
  - Probada en la copia local (subir, bajar, subir: 52 marcadas en la copia, con su bitácora; al bajar se regresan).
  PREPARADO [16/10 14:25] (solo lectura en Pruebas y en PRODUCCIÓN; nada cambiado). Decisión D39.
  Regla: "antes" = comisión liberada (is_released); "H67" = comisión de anticipo no liberada que H67 pasa a Por pagar.
  | OV | Factura | Tipo | Asesor | Monto | Cobro | Regla | Pruebas | Prod. |
  |---|---|---|---|---|---|---|---|---|
  | OV-0157 | F-Piloto1-01 | Avance | Ing. Gabriel Frías | $317.43 | 16/10 | antes | sí | no |
  | OV-0157 | F-Piloto2-01 | Avance | Ing. Gabriel Frías | $317.43 | 16/10 | antes | sí | no |
  | OV-0157 | F-Piloto3-01 | Avance | Ing. Gabriel Frías | $317.43 | 16/10 | antes | sí | no |
  | OV-0157 | A-PILOTO-1 | Anticipo | Ing. Gabriel Frías | $1,428.44 | 14/10 | H67 | sí | no |
  | OV-0053 | 561 | Anticipo | Ing. Gabriel Frías | $11,227.68 | 14/09* | H67 | sí | sí |
  | OV-0056 | 464 | Anticipo | Ing. Gabriel Frías | $10,866.72 | 14/09* | H67 | sí | sí |
  | OV-0054 | 549 | Anticipo | Ing. Gabriel Frías | $10,866.72 | 14/09* | H67 | sí | sí |
  | OV-0038 | 452 | Anticipo | Lic. Gabriel Frías García | $10,151.75 | 14/09* | H67 | sí | sí |
  | OV-0039 | 546 | Anticipo | Lic. Gabriel Frías García | $1,500.00 | 14/09* | H67 | sí | sí |
  | OV-0039 | 557 | Anticipo | Lic. Gabriel Frías García | $1,000.00 | 14/09* | H67 | sí | sí |
  | OV-0039 | 574 | Anticipo | Lic. Gabriel Frías García | $3,321.93 | 14/09* | H67 | sí | sí |
  | OV-0020 | F570AAE16 | Anticipo | Lic. Gabriel Frías García | $9,000.00 | 14/09* | H67 | sí | sí |
  | OV-0041 | F440 | Anticipo | Lic. Gabriel Frías García | $7,417.76 | 14/09* | H67 | sí | sí |
  | OV-0069 | 589 | Anticipo | Lic. Gabriel Frías García | $6,169.46 | 14/09* | H67 | sí | sí |
  | OV-0156 | 639 | Anticipo | Sahía Patrón | $300.00 | 13/10 | H67 | sí | sí |
  *14/09 es la fecha de la importación (cobro y comisión se crearon ese día); la fecha real del cobro no está en Valentina.
  - Pruebas: 15 por $74,202.75 (coincide con lo que viste). Antes de H67 solo las 3 de $317.43 ($952.29).
  - PRODUCCIÓN con el mismo criterio: 11 por $71,822.02 (Ing. $32,961.12 · Lic. $38,560.89 · Sahía $300.00). Hoy en
    producción siguen en "Retenidas" porque H67 no ha llegado a `main`; el riesgo empieza al pasar a `main`.
  - Las 10 del 14/09 son de OVs legacy (D24: sus comisiones se pagan fuera de Valentina). OV-0156 sí se cobró en
    Valentina (13/10).
  Opciones (D39): A) corte por fecha: al pasar a `main`, una migración marca las comisiones de cobros importados el
  14/09 como "pagada fuera de Valentina" (sin movimiento, medio "Fuera de Valentina", motivo en bitácora); lo posterior
  queda por pagar. B) revisión una por una con Karina. C) H67 solo para comisiones nuevas; las viejas siguen en Retenidas.
  Recomiendo A, con OV-0156 ($300) confirmada con Karina. Pase a `main` detenido hasta que Gabriel decida.

- [2026-10-16 14:12] AYUDA: RUTA DE NÓMINA Y COMISIONES (Gabriel 14:07). El asesor ya editó frontend/src/help/ayuda.md
  (sin commit): las tareas "Pagar comisiones" y "Pagar la nómina de cuadrillas" pasan de /treasury a /management, con la
  ruta real "Gerencia → 5. Nómina → Nómina → Comisiones por pagar" / "→ Instalaciones". En /treasury queda solo un aviso.
  1. Verifica que los nombres de los niveles coincidan con la pantalla (corrige el texto si no) y que el buscador
     ("comisiones", "nómina") lleve a Gerencia → 5. Nómina y no a Tesorería. Si el enlace puede abrir directo el nivel
     de Comisiones/Instalaciones, mejor.
  2. Si el panel de Nómina también vive en Tesorería, dime en "Hechas" quién entra por cada lado.
  3. Commit y push SOLO a `pruebas`.
  HECHO [16/10 14:20, Pruebas]:
  1. Nombres corregidos a como se ven en pantalla. En 5. Nómina las tarjetas son **Nómina** (vendedores) y **Destajos**
     (no "Instalaciones"; "Instalaciones" es el rótulo de las tarjetas de adentro). Texto final: "Gerencia → 5. Nómina →
     Nómina (vendedores) → B. Por Pagar" y "Gerencia → 5. Nómina → Destajos → Por pagar (doble verde)".
  2. Buscador: "comisiones", "nómina" y "destajos" dan primero la tarea de Gerencia y "Ir" abre directo el nivel
     (Comisiones en B. Por Pagar, o Destajos en Por pagar). Va con una línea nueva "Enlace: /management?nomina=…" bajo la
     tarea (no se muestra; explicada en el comentario de arriba de ayuda.md). El aviso de Tesorería se quedó sin esas claves
     para que no gane. Comisiones ahora también abre en "B. Por Pagar" (antes en Retenidas), igual que Destajos desde H51.
  3. El panel NO vive en Tesorería: Tesorería solo lee los totales; 5. Nómina está solo en Gerencia (/management), que
     abren DIRECTOR y MANAGER. ADMIN no entra a Gerencia: si busca "comisiones" ve el aviso de Tesorería, sin enlace que no
     pueda abrir. (Si Gabriel quiere que ADMIN pague nómina o comisiones, es decisión aparte.)
  Tests frontend 48, tsc sin errores nuevos, build OK. Probado en pantalla en Pruebas (DIRECTOR): "comisiones" y "destajos" dan primero Gerencia e "Ir" abre B. Por Pagar / Por pagar (doble verde), también desde dentro de Gerencia. No probado en local.

- [2026-10-16 11:26] COMISIONES EN TESORERÍA → 5. NÓMINA → COMISIONES (Gabriel, Pruebas). Hacer después de 11:22 y antes de D38.
  Hoy "B. Por pagar" muestra 3 renglones de OV-0157 de $317.43 (total $952.29) con solo "Rayos X" y "Diferir/Omitir".
  H67. Falta la comisión del ANTICIPO ($1,428.44, A-PILOTO-1) en "Por pagar" (¿quedó en "A. Retenidas"?). Toda comisión
       ya cobrada debe estar en Por pagar, aunque la OV esté cerrada.
  H68. Pagar DESDE esta lista (no obligar a buscar la OV, que ya está en Cerradas): botón "Pagar" por renglón con la misma
       confirmación de H65/D37 (vendedor, factura, cobrado sin IVA, % de la OV, monto, Banco o Efectivo) y
       "Pagar todo a <asesor>" como H66. "Rayos X" se queda solo para consultar.
  H69. La referencia dice "Cobro #85 liquidado": mostrar el folio de la factura y su tipo (p. ej. "F-Piloto1-01 · Avance",
       "A-PILOTO-1 · Anticipo") y la casa.
  En la ayuda v2 (D38), sección /treasury "Pagar comisiones": que diga Tesorería → 5. Nómina → Comisiones → Por pagar.
  HECHO [16/10 11:31] en `pruebas`, sin tocar `main`:
  - H67: sí, la comisión del anticipo estaba en "A. Retenidas": se creó el 14/10 marcada "no liberada" (antes solo se
    liberaban las de avance). Ahora toda comisión de anticipo cobrado va a "Por pagar", con la OV cerrada o no. En
    Pruebas aparecen 4: anticipo $1,428.44 + 3 × $317.43 (incluye la de F-Piloto2-01 regresada a por pagar a las 11:21).
  - H68: botón "Pagar" por renglón con la confirmación de H65/D37 (vendedor, factura, cobrado sin IVA, % de la OV,
    monto, Banco o Efectivo) y "Pagar todo a <asesor> (N · total)" con UN movimiento. "Rayos X" queda para consultar.
  - H69: la referencia dice "A-PILOTO-1 · Anticipo", "F-Piloto1-01 · Avance · <casa>" (antes "Cobro #85 liquidado").
  - Ayuda /treasury "Pagar comisiones": Tesorería → 5. Nómina → Comisiones → Por pagar (y también desde la OV).
  - Tests backend 360 (1 nuevo), frontend 46, build OK. Sin migración. Sin prueba en pantalla.
  Recordatorio: caja chica de Pruebas $164.57 (Efectivo no alcanza para $2,380.73 sin reposición).

- [2026-10-16 11:20] AYUDA "?" VERSIÓN 2 + BUSCADOR (D38, aprobado por Gabriel 11:18). Hacer DESPUÉS de H65/D37/H66/H64.
  1. Textos: reemplaza frontend/src/help/ayuda.md por docs/AYUDA_PROPUESTA_ASESOR.md (versión 2 del asesor, revisada por
     Gabriel: el vendedor NO ve sobreprecio, margen ni costos). Agrega las rutas nuevas que trae: /design/simulator,
     /design/print-center, /planning, /production, /field, /finance/pending-invoices. Verifica que cada texto describa lo
     que hoy hace la pantalla (si algo no coincide, corrige el texto, no la pantalla, y anótalo).
  2. Buscador (D38): al abrir el "?" se muestra la ayuda de la pantalla actual y arriba un campo "¿En qué te ayudo?".
     Al escribir (p. ej. "comisiones", "orden de compra", "OC", "bancos", "proveedores", "cuentas por cobrar") muestra
     las tareas (###) relacionadas de todo el sistema, con el nombre de la pantalla y un enlace para ir a ella.
     - Solo resultados de pantallas que el rol del usuario puede abrir (mismos permisos de las rutas). Un vendedor que
       busca "bancos" no ve nada de Gerencia.
     - Palabras clave por tema en el mismo ayuda.md, editables sin programar (p. ej. una línea "Claves: OC, orden de
       compra, compras" bajo cada ###), con búsqueda sin acentos ni mayúsculas.
     - Documenta en el comentario de arriba de ayuda.md cómo agregar claves.
  Trabajar en `pruebas`, con tests; avisar en "Hechas".
  HECHO [16/10 11:24] en `pruebas` (commit de ayuda D38), sin tocar `main`:
  1. Textos: frontend/src/help/ayuda.md = versión 2 del asesor (15 pantallas; nuevas /design/simulator,
     /design/print-center, /planning, /production, /field, /finance/pending-invoices). Revisé contra las pantallas los
     botones y nombres que menciona (Ejecutar Simulación, Crear lote, Quitar/Cancelar partida, Marcar como enviado,
     Confirmar ingreso, Registrar/Confirmar Avance, Escanear QR, Confirmar carga, Agregar factura, Pagar todo a…,
     secciones 1–5 de Gerencia, etc.): existen. Una corrección de texto: Campo decía "ve solo sus instalaciones de hoy y
     del siguiente día hábil"; eso aplica a Carga del camión. El inicio de Campo muestra las casas de hoy y las ya
     cargadas que faltan por firmar. Corregido en el texto, no en la pantalla.
  2. Buscador: al abrir el "?" sale la ayuda de la pantalla y arriba "¿En qué te ayudo?". Al escribir muestra las tareas
     (###) de todas las pantallas que el puesto puede abrir (mismos permisos del menú: una sola lista para el menú y el
     buscador), con el nombre de la pantalla, sus pasos al tocarla y el botón "Ir". Sin acentos ni mayúsculas. Ejemplos
     probados en tests: "NOMINA" (Dirección) encuentra Administración; "orden de compra" (Almacén) → Compras;
     "comisiones" (Ventas) → solo Ventas; "bancos" (Ventas) → nada.
     Claves: cada ### tiene una línea "Claves: …" (40 de 40); el comentario de arriba de ayuda.md explica cómo agregar
     claves. Un test falla si una tarea nueva no trae claves.
  Tests frontend 46 (3 nuevos), build OK. Sin prueba en pantalla.

- [2026-10-16 11:22] COMISIÓN DE $317.43 DE F-Piloto2-01 PAGADA SIN MOVIMIENTO (resultado de H65), solo en Pruebas.
  Regresarla a "por pagar" con motivo "pago marcado sin movimiento ni medio de pago (H65)", dejando registro en la
  bitácora (quién, cuándo, valor anterior y nuevo). Sin borrar nada. Gabriel la paga de nuevo con la confirmación.
  Hazlo ANTES de la instrucción de las 11:20 (ayuda v2 y buscador, D38).
  HECHO [16/10 17:21 UTC = 11:21 Mérida] en la BD de Pruebas: comisión id 65 (vendedor, F-Piloto2-01, $317.43)
  regresada a "por pagar". Bitácora: sales_commissions 65 · is_paid true → false · motivo "pago marcado sin movimiento
  ni medio de pago (H65)" · fuente "system" (script con la misma conexión de la app). Nada borrado. Gabriel la paga de
  nuevo con la confirmación.

- [2026-10-16 11:05] OBRA PILOTO CERRADA EN DINERO + H65/D37 + H64.
  Confirmado OK en Pruebas: OV-0157 facturado = cobrado = $55,233.03; pendiente, sin cobrar y falta cobrar $0.00; 4 facturas
  PAGADA; 3 casas Cerrado/FACTURADO; H63/H62 (un depósito de $14,728.81 a dos facturas) OK.
  H65. Comisiones: Gabriel dio "Pagar" a la comisión del vendedor del anticipo (A-PILOTO-1) y se marcó pagada SIN mostrar
       el monto, sin confirmar y sin medio de pago. Debe abrir una confirmación: vendedor, factura, monto (cobrado sin IVA ×
       % de la OV; aquí $1,428.44), medio de pago y "Confirmar". Reporta qué monto quedó registrado en la BD de Pruebas
       (solo lectura) y si generó movimiento de banco/caja.
  D37 CONFIRMADA por Gabriel (11:04): medio de pago de la comisión = Banco (elige cuenta) o
       Efectivo (Caja), nunca vacío, para que Bancos/Caja cuadren. Gabriel pidió que la cuenta no sea obligatoria porque a
       veces paga en efectivo. Aplícala junto con H65 (Efectivo = movimiento de Caja chica).
  H64 (menor). Lista de facturas de la OV desordenada: ordenar por fecha y folio.
  Nómina Piloto 2 y 3 confirmada OK: $6,000 en 8 pagos con su carril (H50/H51 ✓).
  H66 (aceptado por Gabriel 11:07): en Tesorería → 5. Nómina, botón "Pagar todo a <persona>" que paga todos sus renglones
       por pagar con UN solo movimiento (un monto total), con confirmación (persona, renglones, total, medio de pago).
  D37 aplica también a la nómina de instaladores: medio de pago Banco (cuenta) o Efectivo (Caja chica), nunca vacío
       (Gabriel 11:07: "muchas veces pago en efectivo").
  HECHO [16/10 11:16] en `pruebas` (e95d71c, migración z5a6b7c8d9e0), sin tocar `main`:
  - H65, BD de Pruebas (solo lectura): la comisión del anticipo (A-PILOTO-1, vendedor, $1,428.44, id 56) SIGUE SIN
    PAGAR. La que quedó pagada es la del vendedor de F-Piloto2-01 (id 65, $317.43), sin movimiento de banco ni de caja
    (el botón solo marcaba). Además el anticipo nunca se "liberaba" (el código solo liberaba avances), así que su
    comisión no se podía pagar. Para que Bancos/Caja cuadren, decide si esa comisión pagada sin movimiento se registra
    aparte (no la toqué).
  - H65/D37: "Pagar" abre el diálogo con Vendedor, Factura, Cobrado sin IVA, % de la OV y Monto a pagar ($1,428.44 en el
    anticipo), y el medio de pago obligatorio: Efectivo (caja chica) o Banco (cuenta). Crea el movimiento (salida de
    banco o egreso de caja chica, categoría "Comisiones") y guarda quién/cuándo/cómo. El botón ahora toma la comisión del
    VENDEDOR de esa factura (antes podía tomar otra fila de la misma factura). La comisión del anticipo queda pagable al
    cobrarse (regla H57). Marcar pagada sin medio ya no es posible.
  - D37 en nómina de instaladores: cada "Pagar" abre el mismo diálogo (Efectivo o Banco); ya no se paga sin medio. Un pago
    hecho no se regresa a "Por pagar" (antes se podía, sin revertir el banco).
  - H66: en "Por pagar", cada persona con 2+ renglones tiene "Pagar todo a <nombre>": confirmación con persona,
    renglones (Piloto 2 · Muebles…), total y medio de pago; UN solo movimiento por el total.
  - H64: facturas de la OV ordenadas por fecha y folio.
  - AVISO: la caja chica de Pruebas tiene $164.57. Pagar en Efectivo $1,428.44 dará "Saldo insuficiente en caja chica"
    hasta hacer una reposición (Caja chica → Reposición). Por Banco funciona.
  - Tests backend 359 (2 nuevos: comisión en efectivo con su egreso; pagar todo a una persona con un movimiento), frontend
    43, build OK, migración subir/bajar/subir en local. Sin prueba en pantalla.
  QUÉ PROBAR (Gabriel): OV-0157 → comisión del anticipo → Pagar → ver $1,428.44 → Banco Santander → Confirmar (o reponer
  caja chica y usar Efectivo). Tesorería → 5. Nómina → Por pagar → "Pagar todo a David".

- [2026-10-16 10:18] URGENTE H63 + H49/H62 (Tesorería → Registrar Ingreso con dos facturas). Gabriel salió ~2 h.
  Contexto: OV-0157 facturada completa. F-Piloto2-01 ($18,411.01, amortiza $11,046.61, saldo $7,364.40) y
  F-Piloto3-01 ($18,411.01, última casa, amortiza $11,046.60, saldo $7,364.41) — D36 confirmado al centavo en pantalla.
  H63. Un solo depósito de $14,728.81 (Santander) aplicado a las dos facturas (F-Piloto2-01 → $0.00 saldada; abono
       $7,364.41 a F-Piloto3-01; "Depósito aplicado al 100%") → al dar "Registrar Ingreso": "Hubo un error al registrar
       el movimiento". Reproduce (logs de valentina-pruebas-api, hora ~10:15 Mérida), corrige y confirma en la BD de
       Pruebas (solo lectura) que NO quedó nada a medias (ingreso sin aplicar, una factura pagada y la otra no). El
       aviso debe mostrar la causa. NO registres el cobro tú: lo hace Gabriel al regresar.
  H49 (no quedó): al elegir la primera factura el importe se queda en 0.00.
  H62. Al "Agregar factura" el importe toma el saldo de una sola factura; debe ser la suma de los saldos elegidos
       ($14,728.81) y actualizarse al quitar/agregar.
  Después, en orden: H60 (Campo firma/sincronizar sin aviso; revisar firmas duplicadas en Piloto 2/3), H57 si no está,
  H52–H55, H58, H59. Trabajar en `pruebas`; avisar en "Hechas" con lo que Gabriel debe probar al volver.

- [2026-10-16 10:08] MÁS DEL ENSAYO (Piloto 2 y 3). Confirmado OK: H31, H32, H35, H56 (códigos 431c966e Piloto 2), carga de 4 carriles.
  H60 (PRIORIDAD). Campo, pestaña Firma (Piloto 2/3, iPhone, David): después de "Confirmar firma" la pantalla no cambia y
       se puede seguir dando "Confirmar firma" indefinidamente; igual con "Sincronizar": no hay aviso de éxito/error ni
       cambio de estado. Debe: deshabilitar el botón mientras guarda; al guardar mostrar "Firma guardada" (local) y al
       sincronizar "Sincronizado ✓" o el error; reemplazar el lienzo por "Firmado: fecha hora" como en Piloto 1;
       nunca registrar dos firmas. Revisa en la BD de Pruebas (solo lectura) si quedaron firmas duplicadas en Piloto 2/3.
  H58. Manifiesto de Piedra: mostrar el código corto ("Código: 431c966e") además del UUID largo.
  H59. Campo inicio: el botón "Carga del camión" debe decir cuántas cargas faltan (o verse apagado si no hay).
  HECHO [16/10 10:23] en `pruebas`, sin tocar `main` (e7dea28 H63/H62/H49; 72cc4f0 H58–H60; 657cbd1 H57; edde989 H52–H55):
  - H63, causa: en la base cada factura liga UN movimiento bancario (campo único). Un depósito repartido en dos facturas
    intentaba ligar el mismo movimiento a las dos → error 500, sin detalle. Reproducido en test. Ahora la primera
    factura queda ligada y cada abono guarda su movimiento bancario; un solo movimiento de $14,728.81.
    BD de Pruebas (solo lectura): NO quedó nada a medias. No hay movimiento bancario nuevo, ni abonos; F-Piloto2-01 y
    F-Piloto3-01 siguen PENDIENTES; saldo de OV-0157 $14,728.81. El aviso ahora muestra la causa (o el código del servidor).
  - H49/H62: el importe del ingreso es la suma de los saldos de las facturas elegidas y se actualiza al agregar/quitar
    (hasta que se escriba un importe a mano).
  - H60: en Pruebas NO hay firmas duplicadas: Piloto 2 y 3 tienen una firma cada una (16:01/16:02 UTC) y 4 pagos de nómina
    por casa, sin repetidos (el servidor ya cerraba la casa una vez). Ahora además: el servidor ignora una segunda firma
    y el endpoint directo la rechaza; "Confirmar firma" cambia el lienzo por "Firma guardada en el teléfono. Falta
    Sincronizar" con la imagen y "Volver a firmar"; "Sincronizar" muestra en pantalla "Sincronizando…", "Sincronizado ✓
    hh:mm" o el error, y no se puede tocar dos veces. Firmada: "Firmado: fecha hora" (como Piloto 1).
  - H58: el manifiesto de piedra dice "Código: 431c966e" debajo del QR.
  - H59: Campo inicio: "Carga del camión · N por cargar", o gris "sin cargas pendientes".
  - H57 y H52–H55: ya hechos (ver abajo).
  - Tests backend 357, frontend 43, build OK. Nada probado en pantalla (Chrome no conectado).
  QUÉ PROBAR AL VOLVER (Gabriel):
  1. Tesorería → Registrar Ingreso: elegir F-Piloto2-01 (importe $7,364.40), "Agregar factura" F-Piloto3-01 (importe
     $14,728.81) → Registrar. Esperado: ambas PAGADAS, un movimiento de $14,728.81, OV-0157 "Falta cobrar" $0.00 y
     comisiones de $317.43 por casa (total vendedor $2,380.73).
  2. Campo (iPhone) en una casa por firmar: Confirmar firma → Sincronizar; ver los avisos en pantalla.
  3. Empaque piedra (un botón), Centro de Impresión (columna Impresión), calendario (PM/PP en fecha real),
     "Piedra: lista", manifiesto con código corto, botón de Carga con el número.

- [2026-10-16 09:42, parte 2] H52–H55 (del mismo ensayo). HECHO [16/10 10:09] en `pruebas` (edde989), sin tocar `main`:
  - H52: en Empaque, piedra lleva un solo botón "🪨 Declarar y solicitar manifiesto" (se quitó "Declarar" suelto).
  - H53: una casa sale de Empaque de su lote cuando ya está firmada (CLOSED/garantía) o ya se cargó el carril de ese
    lote. Antes solo salía al pasar a READY; Piloto 1 seguía en LOTE-PIEDRA-0011.
  - H54: las tarjetas de "Listo para instalarse" dicen "Piedra: lista" / "MDF: lista" cuando el lote ya terminó (DEAD);
    un lote terminado cuenta como producido en el calendario y su semáforo queda azul-verde.
  - H55: en el calendario, cuando el lote de un carril arrancó, la píldora PM/PP se mueve a la fecha real de arranque
    del lote (día de Mérida); la fecha programada no se borra (sigue en la ventana de la casa).
  - Tests backend 356 (1 nuevo con H53 y H55), frontend 43, build OK. Sin migración.
  - NO probado en pantalla (Chrome no conectado).

- [2026-10-16 09:50] H57 COMISIÓN POR CADA COBRO (Gabriel, 16/10). Confirmado OK H47 y H51 en Pruebas.
  Regla de Gabriel: la comisión del vendedor se paga por cada cobro (anticipo y cada avance). En OV-0157 la factura
  F-Piloto1-01 (avance, PAGADA) muestra comisión "—"; el anticipo sí muestra "Pagar".
  CONFIRMADO por Gabriel (09:49): comisión de cada cobro = efectivo cobrado sin IVA × el % de comisión DE ESA OV (cada OV
  tiene el suyo; nunca un % global). OV-0157 (5%): anticipo $33,139.82/1.16×5% = $1,428.44; cada casa $7,364.40/1.16×5% = $317.43;
  total 1,428.44 + 3×317.43 = $2,380.73 = comisión de la cotización (cuadre, D16 ≤ $1.00 en la última).
  Revisa qué hace hoy el código con la comisión del anticipo y de los avances, aplica la regla y deja "Pagar" en
  F-Piloto1-01. Reporta en "Hechas" las cifras de OV-0157. Trabajar en `pruebas`.
  HECHO [16/10 10:00] en `pruebas` (657cbd1), sin tocar `main`:
  - Qué hacía el código: la comisión se crea cuando la factura queda saldada, sobre lo cobrado. Por Cobranza (abono)
    ya era así para anticipo y avances; por Tesorería (Registrar Ingreso) solo se creaba para anticipos, y la de
    avances nunca. Por eso F-Piloto1-01 decía "—". "Confirmar cobro" la calculaba sobre el importe completo (incluía el
    anticipo amortizado, que ya cobró comisión).
  - Ahora: una sola función salda la factura (Cobranza, Tesorería y confirmación). Comisión = efectivo cobrado sin IVA
    (importe − anticipo amortizado − notas de crédito) × el % de esa OV (applied_commission_percent), una vez por cobro.
  - Corrección de F-Piloto1-01 en la base de Pruebas (autorizada por Gabriel 16/10): con esa misma función, motivo
    "corrección H47". Bitácora: 6 cambios (status PENDING→PAID, fecha de pago = la del cobro, commission_paid, 3
    comisiones nuevas), fuente "system".
  - Cifras OV-0157 (5%): anticipo $1,428.44 (base $28,568.81) · F-Piloto1-01 $317.43 (base $6,348.62, liberada → "Pagar").
    Con Piloto 2 y 3 al mismo cobro: $1,428.44 + 3 × $317.43 = $2,380.73.
  - Ojo, para Gabriel: además del vendedor, el sistema crea la comisión "Director global" (2%) a los dos usuarios
    Director con tarifa (ids 2 y 3: $571.38 c/u en el anticipo, $126.97 c/u en F-Piloto1-01). Ya existía; no la toqué.
  - Tests backend 355 (1 nuevo: cobro de avance por Tesorería con su comisión).

- [2026-10-16 09:42] URGENTE PARA SEGUIR EL ENSAYO + H56.
  1. AHORA (solo lectura en la BD de Pruebas): escribe aquí abajo el código corto de etiqueta (el que se teclea en Campo,
     p. ej. bd5662bf) de Piloto 2 y Piloto 3 de OV-0157, MDF y Piedra. Gabriel no los puede imprimir (ver H56).
  2. H56. Centro de Impresión vacío para Piloto 2 y 3: se pidieron etiquetas MDF y Piedra en Empaque y luego se pasaron a
     "Listo para instalarse" (READY) antes de imprimir; como la lista filtra por estado, desaparecieron. Regla: una
     solicitud de etiquetas/manifiesto sigue en la bandeja hasta que se descargue (marca "impresa" con fecha y usuario),
     sin importar el estado de la casa; y en Empaque, al mover a Listo sin haber impreso, avisar.
  Otros del ensayo de hoy (no urgentes): H52 piedra: un solo botón "Declarar y solicitar manifiesto"; H53 Piloto 1 ya
  firmada sigue en Empaque dentro de LOTE-PIEDRA-0011; H54 tarjetas dicen "Piedra: DEAD" (decir "Piedra: lista");
  H55 calendario: una vez producida, la píldora PM/PP debe ir a la fecha real de producción.
  Confirmado OK hoy: H26, H27, H30 (pendiente confirmar), H33, H42 (cuadrillas se conservan), D36 (cifras correctas), H9.
  RESPUESTA AL PUNTO 1 [16/10 09:40] (lectura en la BD de Pruebas): Piloto 2 (id 1652) y Piloto 3 (id 1653) NO tienen
  código todavía: su qr_code está vacío. El código corto (Piloto 1 = bd5662bf) se crea la primera vez que se genera el
  PDF de etiquetas o el manifiesto de piedra en el Centro de Impresión, y ahí no aparecen (H56). Ambas en READY, 4
  bultos MDF + 1 herraje y 2 piezas de piedra. En cuanto suba la corrección de H56 aparecerán en el Centro de Impresión;
  al imprimirlas se crea el código. Voy con H56 ya.
  HECHO H56 [16/10 09:49] en `pruebas` (1c80fc2, migración y4z5a6b7c8d9), sin tocar `main`:
  - Causa: mi H45 (15/10) quitó READY de la lista para no traer casas viejas; Piloto 2 y 3 se pasaron a READY sin imprimir.
  - Regla nueva: pedir etiquetas (bultos) o declarar piezas de piedra en Empaque deja la solicitud "pendiente de imprimir";
    sigue en el Centro de Impresión, sin importar el estado de la casa, hasta que se descarga. La descarga la marca
    impresa con fecha y usuario (columna "Impresión"); se puede reimprimir mientras la casa siga en la ventana de H45.
  - Empaque: al pasar a Listo una casa con algo sin imprimir sale el aviso "falta imprimir …; sigue en el Centro de
    Impresión".
  - La migración marca como solicitadas solo las casas con carril de instalación pendiente y sin etiquetas nunca
    generadas: en Pruebas son exactamente Piloto 2 y 3 (MDF y Piedra); las 21 casas viejas en READY siguen fuera.
    En producción no marca ninguna.
  - Al imprimirlas se crea su código corto (el punto 1): Piloto 2 y 3 aún no tienen.
  - Tests backend 354, frontend 43, build OK, migración subir/bajar/subir en local.
  Pendientes (no urgentes, sin empezar): H52, H53, H54, H55.


- [2026-10-16 09:25] NÓMINA DE INSTALADORES (Tesorería → 5. Nómina), Piloto 1 de OV-0157. PRIORIDAD H51.
  H51. Por pagar $3,000 (Dariel $700, David $800 + $800, Miguel $700). Gabriel pagó 3 renglones (Santander):
       Pagadas $2,200 y la tarjeta "Por pagar" dice $800, pero la lista quedó "Sin registros": el segundo renglón de
       David desapareció sin pagarse. Probable: los renglones se identifican por instancia (+ persona) y no por carril
       (MDF/Piedra), así que pagar uno escondió el otro. Corregir para que cada pago sea por instalación (carril) y
       el renglón pendiente vuelva a aparecer; no borrar ni duplicar pagos. Verifica en la BD de Pruebas (solo lectura)
       qué quedó registrado y deja el $800 pendiente visible para que Gabriel lo pague.
  H50. Cada renglón debe decir la instalación: "Piloto 1 · Muebles" / "Piloto 1 · Piedra" (hoy los de David son iguales).
  Confirmado OK: cálculo D18 (1 día × $800 líder / $700 ayudante por carril), total $3,000.
  Trabajar en `pruebas` con tests; avisar en "Hechas". Junto con H47–H49 de arriba.

- [2026-10-16 09:10] H47 (D36 en Pruebas): la ventana de la OV no descuenta la amortización del anticipo.
  OV-0157 tras registrar F-Piloto1-01 ($18,411.01, amortiza $11,046.61):
  - CxC (lista) está bien: monto $18,411.01, ant. aplic. $11,046.61, saldo $7,364.40.
  - Ventana de la OV MAL: "Total facturado" $51,550.83 (suma anticipo + avance bruto = cuenta el anticipo dos veces),
    "Pendiente de facturar" $3,682.20 (debería ser $36,822.02 = 2 casas con IVA), "Facturado sin cobrar" $18,411.01
    (debería ser $7,364.40, igual que CxC). Revisar también tablero de Dirección/Gerencia, Rayos X, saldo vivo y KPIs
    que sumen facturas: toda cifra debe tratar la amortización del anticipo igual que CxC.
  - La ventana no muestra "Falta cobrar del contrato" (D33); agregarla: $55,233.03 − cobrado.
  - Confirmado OK en la misma ventana: Sobreprecio 45.00% (H1), costo $31,195.71 (H2/H4), Piloto 1 "Cerrado / FACTURADO".
  - "Registrar Abono" desde la ventana de la OV (OrderStatementModal → Abono): propone $18,411.01 (importe bruto) en
    vez del saldo $7,364.40; además en "Instancias cubiertas por este abono" ofrece Piloto 2 y Piloto 3 y NO Piloto 1,
    que es la casa de esa factura; y muestra "¿Es anticipo?" en una factura de avance. Debe proponer el saldo real
    (mismo cálculo que CxC), mostrar las casas de esa factura y ocultar "¿Es anticipo?" en avances.
  - Tras cobrar $7,364.40 por Tesorería (Registrar Ingreso, saldo correcto): la ventana de la OV muestra Total cobrado
    $40,504.22 (bien), pero "Facturado sin cobrar" $11,046.61 (debería ser $0.00: es el anticipo amortizado) y la fila
    F-Piloto1-01 sigue con botón "Abono" en vez de "PAGADA". Mismo origen: la ventana no resta la amortización.
  - H49 (menor): Registrar Ingreso de Tesorería, al elegir la factura, deja el importe en 0.00; proponer el saldo.
  Trabajar en `pruebas` con tests; avisar en "Hechas".
  HECHO [16/10 09:39] en `pruebas` (03a5988 y 1afd9c7), sin tocar `main`:
  - H51: en la BD de Pruebas no se perdió nada: David IM $800 PAGADO, Miguel IM $700 PAGADO, Dariel IP $700 PAGADO y
    David IP $800 POR PAGAR (id 3). Cada pago ya es por carril; el servidor sí lo enviaba. La lista abría en "Retenidas"
    (vacía → "Sin registros") aunque la tarjeta dijera $800 por pagar. Ahora abre en "Por pagar" y cada bandeja dice su
    nombre y cuántos pagos tiene. El $800 de David queda visible para pagarlo.
  - H50: cada renglón dice "Piloto 1 · Muebles" o "Piloto 1 · Piedra" (columna "Instalación").
  - H47: nueva consulta de cifras de la OV en el servidor, con la misma regla de saldo que CxC. Para OV-0157 hoy:
    Total facturado $40,504.22 · Pendiente de facturar $36,822.02 (2 casas con IVA; amortizarán $22,093.21 de anticipo)
    · Total cobrado $40,504.22 · Facturado sin cobrar $0.00 · Falta cobrar del contrato $14,728.81. F-Piloto1-01
    se muestra PAGADA.
    Causa de fondo: el ingreso de Tesorería no restaba la amortización, por eso F-Piloto1-01 quedó PENDIENTE en la base
    aunque está cubierta. Corregido para cobros nuevos (salda con la amortización y no acepta más que el saldo); el
    registro de Piloto 1 sigue PENDIENTE en la base (no lo modifiqué; la ventana y CxC lo tratan como pagado por saldo).
    También pasan a saldo abierto la antigüedad de CxC (analítica y flujo), la tarjeta de Gerencia y la de Cobranza.
  - H48: "Registrar Abono" propone el saldo real, muestra "Casas de esta factura" y oculta "¿Es anticipo?" en avances.
  - H49: Registrar Ingreso propone el saldo de la factura elegida.
  - Tests: backend 353 (2 nuevos), frontend 43 (2 archivos nuevos), build OK. Sin migración.
  - NO probado en pantalla: la extensión de Chrome no estaba conectada. Pendiente de revisar en Pruebas.

- [2026-10-15 16:15] DECISIÓN DE GABRIEL: FACTURA DE AVANCE = CASA COMPLETA CON ANTICIPO APLICADO (D36) + D35-A.
  D36. "Registrar Avance" factura el valor COMPLETO de la casa con IVA y amortiza la parte proporcional del anticipo:
       - Prellenar: importe = partida de la casa × 1.16 (Piloto 1: $18,411.01); anticipo amortizado = importe × % de
         anticipo de la OV, sin pasar de lo que queda del anticipo cobrado (Piloto 1: $11,046.61); por cobrar = resto
         ($7,364.40). Mostrar las tres cifras antes de guardar; importe editable, amortización editable con motivo.
       - La última casa de la OV amortiza lo que quede del anticipo (que no sobren ni falten centavos; D16 ≤ $1.00).
       - Varias casas en una sola factura: sumar casas y su amortización.
       - El saldo vivo de la OV y el reporte CxC deben cuadrar: anticipo + avances − amortizaciones = total del contrato.
  D35 = A: en Pendiente de Facturar los avances van CON IVA (lo que se factura), igual que los anticipos.
  Trabajar en `pruebas` con tests; probar con Piloto 1 de OV-0157 SIN guardar la factura (la registra Gabriel en el
  ensayo). Avisar en "Hechas".
  HECHO [15/10 16:24, Mérida] — rama `pruebas` (173d256; main sin tocar). Tests: backend 351 (4 nuevos de D36), frontend
  40, build OK; sin migración.
  - "Registrar Avance" prellena las tres cifras desde el servidor y las muestra antes de guardar. Probado en Pruebas con
    Piloto 1, sin guardar: factura $18,411.01, anticipo amortizado $11,046.61 (60%), por cobrar $7,364.40; queda del
    anticipo cobrado $33,139.82. Al editar la amortización aparece "Motivo" obligatorio y el botón se bloquea hasta
    escribirlo. Cancelé; en la BD la OV-0157 sigue solo con su anticipo.
  - Reglas (en el servidor, también si se registra sin la pantalla): amortización = factura × % anticipo, sin pasar de
    lo que queda del anticipo cobrado ni de la factura; la última casa sin facturar de la OV amortiza todo lo que
    queda; varias casas en una factura suman casas y amortización; editar la amortización exige motivo (queda en las
    notas de la factura).
  - Cuadre: test con 3 casas (precio de Piloto 1): anticipo + avances − amortizaciones = total del contrato (≤ $1.00) y
    la suma de amortizaciones = anticipo cobrado, sin centavos sobrantes.
  - D35-A: en Pendiente de Facturar los avances van con IVA (renglón, subtotal y total; el total de la tarjeta suma
    anticipos y avances con IVA: hoy $140,551.73).
  - Corrección encontrada: la ventana de cobro de Cobranza (Rayos X) guardaba como importe solo el efectivo a cobrar,
    sin la amortización, mientras los saldos tratan el importe como factura completa (habría restado el anticipo dos
    veces). Ahora guarda la factura completa y usa la misma sugerencia del servidor. No la probé en pantalla.

- [2026-10-15 12:25] HALLAZGOS DEL ENSAYO, SEGUNDA PARTE (pasos 11–13 en Pruebas, Piloto 1 de OV-0157).
  Confirmado en Pruebas: H38, H37 (cámara iPhone escanea), H14, D32. Trabajar en `pruebas`; tests; avisar en "Hechas".
  PRIORIDAD:
  H42. Reprogramar una instalación BORRA su cuadrilla: IP de Piloto 1 tenía cuadrilla el 22/10; al moverla a hoy y
       guardar, quedó sin cuadrilla (y Campo decía "Sin cuadrilla asignada" para Piedra). Probable efecto del "Guardar"
       único (H13). Además Piloto 2 y 3 aparecen sin cuadrilla y Gabriel se las había puesto: revisar en la BD de Pruebas
       si se perdieron y por qué. Cambiar fecha nunca debe tocar la cuadrilla.
  H45. Centro de Impresión: cuando la casa pasa a CARGADO por MDF, desaparece y ya no se puede imprimir el manifiesto de
       Piedra aunque la piedra no se ha cargado. Mostrar cada carril hasta que ese carril se cargue.
  H39. Calendario: Piloto 2 y 3 muestran ✓ PM (producción MDF hecha) aunque sus lotes MDF (0017/0018) siguen en
       "Lote por producir"; parece que el lote de piedra marcó ambos carriles. Cada carril con su propio estado.
  H43. Campo, pestaña Herrajes: "Sin herrajes en receta", pero la receta tiene bisagras, taquetes y tornillos y salen
       mezclados en Empaque. Clasificar bien (mismo criterio que el surtido de herrajes en Producción).
  H41. Campo: "Trabajo terminado" está arriba, fuera del flujo de pestañas; ponerlo como paso visible en el orden
       fotos → Trabajo terminado → firma (y en la pestaña Firma, cuando falte, un botón que lleve a él).
  H40. Campo, pantalla de casa cargada: el renglón "Asignación: Cargada · Instancia:" queda escondido bajo el encabezado.
  H46. Pendiente de Facturar (Avances): textos técnicos en pantalla ("CLOSED", "administration_invoice_folio vacío",
       "customer_payment_id", "TOTAL BUCKET"); pasar a español claro y decir si los montos son con o sin IVA.
  Decisión confirmada por Gabriel: la firma del cliente es UNA por casa, al final de todas sus instalaciones (MDF y
  Piedra). Se queda como está.
  HECHO [15/10 12:40, Mérida] — rama `pruebas` (push solo a pruebas; main sigue en 081b2ab). Tests: backend 344,
  frontend 39, build OK, una sola cabeza de migraciones (no hay migración nueva). Sin prueba en pantalla todavía.
  - H42 (559804c). Revisé la BD de Pruebas (solo lectura) y la bitácora: NO se borró ninguna cuadrilla. La IP de
    Piloto 1 y la de Piloto 2 nunca se guardaron (el 14/10 Pruebas aún tenía el modal viejo, con un botón por carril, y
    Piloto 1 no tenía piezas de piedra al asignar). Hoy: P2 tiene cuadrilla IM; P3 tiene IM e IP; P1 se firmó.
    Hueco real que sí corregí: al mover una fecha (modal o arrastrando en el calendario) la cuadrilla se quedaba con la
    fecha vieja (el líder la veía otro día). Ahora la cuadrilla sigue la fecha de su carril, nunca se borra al cambiar
    o quitar la fecha, el modal solo manda el equipo si cambió, y arrastrar también respeta "no antes de producir"
    (H38 no cubría el arrastre).
  - H45 (9566aad). Centro de Impresión: cada carril (etiquetas MDF / manifiesto de Piedra) sigue visible hasta que ESE
    carril se carga, aunque la casa ya esté CARGADO por el otro.
  - H39 (08190f9). Calendario: ✓ por carril. PM/PP se marcan cuando arrancó el lote de ese carril; IM/IP cuando ese
    carril se cargó. Causa: LOTE-PIEDRA-0011 puso las 3 casas "en producción" y el ✓ PM usaba el estado de la casa.
    Pendiente menor: el modal de la casa aún bloquea PM y PP juntos por el estado de la casa (lo anoto en ROADMAP).
  - H43 (81436cd). Campo/Herrajes: se comparaba la categoría con "HERRAJE" y el catálogo dice "Herrajes"; ahora usa el
    mismo criterio del surtido de herrajes de Producción.
  - H41 (5f2f02b). Campo: pestañas Empaque → Herrajes → Plano → Fotos → Trabajo terminado → Firma; en Firma, mientras
    falte, botón "Ir a Trabajo terminado". Arriba queda solo el estado de cada carril.
  - H40 (5f2f02b). Carga: el encabezado fijo usaba márgenes de escritorio y en el teléfono tapaba el renglón
    "Asignación"; además el detalle abre arriba (antes conservaba el scroll de la lista).
  - H46 (afb3919). Pendiente de Facturar en español claro y con IVA indicado en cada monto. Hallazgo: los anticipos
    van con IVA y los avances sin IVA, y el total los suma (D35, ver pregunta abajo).
  - Firma una por casa: sin cambios, como confirmó Gabriel.
  PRUEBA EN PANTALLA EN PRUEBAS [15/10 12:48] (sesión de Dirección):
  - H39 ✓: Piloto 2 y 3 ya sin ✓ PM (✓ PP sí: su lote de piedra arrancó). Al guardar en el modal el ✓ PM reaparecía
    (el calendario se rearmaba con el estado de la casa); corregido (545c440) y confirmado.
  - H42 ✓: Piloto 2, IM 23→22 y Guardar: la cuadrilla (David Márquez + Miguel Sosa) se conservó y su fecha pasó al
    22 (lo vi en la BD, solo lectura). Lo regresé al 23/10; quedó como estaba.
  - H45: la primera versión metía casas READY viejas al Centro de Impresión; ajustada (f47c5de): solo una casa ya
    CARGADO/INSTALADA conserva el carril que falta cargar. Hoy en Pruebas no hay casa en ese caso (cubierto por test).
  - H43 ✓ (Herrajes con bisagras, tornillos, taquetes; Empaque sin herrajes), H41 ✓ (pestaña Trabajo terminado),
    H46 ✓ (textos e IVA). H40: seguía recortado; la causa real era el `sticky` contra el padding del contenedor;
    corregido (a165dac) y confirmado; "Instancia" ahora dice "En producción" (antes IN_PRODUCTION).
  - No pude reducir Chrome a ancho de teléfono: H40 y H41 conviene verlos en el iPhone.
  - Aviso para Gabriel (Render, no es código): la CDN de Render guarda index.html 5 min por ruta
    (`s-maxage=300`); entrar directo a /planning dio la versión anterior aunque "/" ya tenía la nueva, y "Recargar"
    no lo arregla hasta que vence. Sugerencia: en Render, sitio estático → Headers, regla `/*` con
    `Cache-Control: no-cache` (en Pruebas y en producción).
  SEGUIMIENTO [15/10 13:03] (sin instrucción nueva; trabajo en curso):
  - H38 + H39 (6b1c0d9): el límite "no instalar antes de producir" usaba cualquier lote; en Piloto 2 el lote de piedra
    habría permitido programar la instalación MDF antes de producir el MDF. Ahora cuenta solo el lote MDF. El modal de
    la casa bloquea PM y PP cada uno por su carril (a1a3e79): en Piloto 2, PM editable y PP bloqueado (visto en Pruebas).
  - H42, protección extra (252f48b): el modal reiniciaba los campos de cuadrilla cada vez que la página refrescaba la
    casa; si eso pasaba después de cargarla, "Guardar" la habría quitado. Ahora solo se reinicia al cambiar de casa.
    No lo reproduje en Pruebas (la cuadrilla se vio bien), así que no lo doy por causa confirmada de lo que vio Gabriel.
  - Pendiente aparte: quitar cuadrilla hace borrado físico de la asignación programada (regla de oro); lo anoto.
  - [13:23] Hecho: quitar la cuadrilla de un carril ya no la borra; queda CANCELADA (la bitácora guarda quién y
    cuándo) y todas las consultas la ignoran; volver a asignar crea una nueva. Sin migración. Tests backend 347.

- [2026-10-14 14:40] RESPUESTAS DE GABRIEL (14:35) A LO PENDIENTE DEL ENSAYO.
  1. Subida: opción (c). Crea la rama `pruebas` desde el HEAD actual (con los 31 commits) y haz push SOLO de esa rama
     (`git push origin HEAD:pruebas`). NO push a main. Gabriel autorizó este push en horario laboral porque no toca
     producción. Después Gabriel cambia en Render la rama de valentina-pruebas-api y valentina-pruebas a `pruebas`.
     Regla nueva para CLAUDE.md: todo cambio se sube primero a `pruebas`; `main` (producción) solo después de probarlo en
     Pruebas y con la regla de horario/autorización. Anótala.
     Ojo: la migración x3y4z5a6b7c8 correrá en la BD de Pruebas al desplegar; confirma que el arranque la aplica.
  2. D33 aprobada: "Falta cobrar del contrato" / "Facturado sin cobrar". Pásala a Resueltas.
  3. H1: salió en la CAPTURA de la cotización (renglón de la partida), COT-0089 de OV-0157, Director. Gabriel captura
     sobreprecio 45% y la pantalla muestra 52.63% (= sobreprecio con la comisión del 5% incluida). Corregir: la columna
     "Sobreprecio" muestra el 45% que se capturó; si se quiere mostrar el efecto de la comisión, en otra columna con
     nombre claro. Revisa también la pantalla de revisión/autorización de cotizaciones con el mismo criterio.
  4. D34: quitar el lápiz de renombrar casas del Simulador (el bautizo es solo de Ventas). Pásala a Resueltas.
  Al terminar 2–4, súbelos también a `pruebas`. Avisa en "Hechas" con el commit de cada uno.
  HECHO [2026-10-14 14:43 Mérida]
  1. Rama `pruebas` creada y subida (819b6da, 31 commits); `main` sin tocar (081b2ab). Regla "primero Pruebas" en
     CLAUDE.md (e9f2cc7). El arranque (Dockerfile) corre `alembic upgrade head`: x3y4z5a6b7c8 se aplica en Pruebas.
  2. D33 → Resueltas (4c90aff).
  3. H1 (1d3c1b8): causa — la captura cargaba la comisión del usuario después de los catálogos (si no cargaba, 0) y el
     servidor cambiaba una comisión 0 por la del usuario; precio y columna usaban comisiones distintas. Ahora la
     comisión carga sola y el servidor respeta la que se envía. Revisión/autorización (FinancialReviewModal),
     órdenes de cambio y Rayos X ya usan la comisión guardada de la cotización: mismo criterio, sin cambio.
     COT-0089 (precio con 5%, comisión guardada 5%) muestra 45%.
  4. D34 (e5d1cbb): sin lápiz de renombrar en el Simulador; D34 → Resueltas (4c90aff).
  Subido a `pruebas` junto con lo anterior. Prueba en pantalla en Pruebas: cuando Gabriel cambie la rama en Render.

- [2026-10-14 13:15] HALLAZGOS DEL ENSAYO GENERAL — OBRA PILOTO (OV-0157, Pruebas). Gabriel autorizó. Trabajar en este orden;
  probar cada cambio en Pruebas antes de producción; push según la regla de horario o autorización de Gabriel.
  Reportar en "Hechas" qué se corrigió y qué quedó pendiente con motivo.

  PRIORIDAD 1 — BLOQUEA EL ENSAYO (paso 11 en adelante):
  H38. Planeación, InstanceEditModal (orderError): cuando la casa ya se produjo (PM bloqueada), IM/IP se siguen validando
       contra la PM PROGRAMADA y no dejan adelantar la instalación. Corregir: si la casa ya entró/salió de producción,
       validar IM/IP contra la fecha REAL de producción (o hoy), no contra la PM programada. Caso de prueba: Piloto 1
       (OV-0157), PM 19/10 ya producida hoy; debe dejar poner IM = 14/10.
  D32. Campo → Carga del camión para el líder: mostrar trabajos de HOY y del SIGUIENTE día hábil (los muchachos a veces
       cargan la tarde anterior). Hoy solo muestra los de hoy.
  H37. Campo en iPhone (Safari/Chrome): "Escanear QR del bulto" no abre la cámara y regresa a la lista de casas.
       El código manual (bd5662bf-1) sí funciona desde la laptop. Reproducir y corregir (permiso de cámara iOS /
       html5-qrcode); si la cámara falla, mostrar el campo de código manual con un aviso, nunca regresar a la lista.

  DECISIONES NUEVAS DE GABRIEL (14/10):
  D29. El bautizo es solo de Ventas: quitar el botón "Bautizo Masivo" y su modal del Simulador (SimulatorPage).
       Actualizar BaptismModal (comentario de puntos de entrada) y la ayuda.
  D30. Simulador: si falta material núcleo (MDF o Piedra), NO se puede crear el lote, ni MDF ni Piedra. Botón deshabilitado
       con aviso "Falta <material>: <cantidad>". (Hoy MDF crea en ON_HOLD y Piedra crea sin bloqueo —
       handleCreateStoneBatch ignora suggested_status.) Herrajes y demás pueden quedar negativos: no bloquean.
       El bloqueo al entrar a producción (discharge_reservations) se queda como segunda barrera.
  D31. Con faltante núcleo, el Simulador ofrece "Generar requisición a Compras", con confirmación
       "¿Generar requisición por X de <material>?" (Diseño puede estar solo probando). La requisición queda ligada a la OV.

  SIMULADOR / COMPRAS / ALMACÉN:
  H18. "Crear Lote MDF" no respondió hasta recargar (Cmd+R); sin aviso de error. Revisar estado viejo tras cambiar
       selección; siempre mostrar éxito o error.
  H20. Nueva solicitud de compra: mostrar la unidad del catálogo junto a Cantidad.
  H21. Requisición sin liga a OV: agregar selector de OV/proyecto. Hoy sale "S/PROYECTO" en una pantalla y "GENERAL" en otra.
  H22. Mesa de Control: "Quitar partida" y "Cancelar partida" usan el mismo ícono rojo. Quitar = flecha de regreso (no destructivo).
  H23. cancel_po_item no recalcula total_estimated_amount de la OC (remove_po_item sí).
  H24. Recepción (Andén): la descripción del material sale cortada ("GRANITO T").
  H25. Andén de Descarga: todas las OCs muestran etiqueta "ANTICIPO", aunque no pidieron anticipo. Revisar significado o quitarla.
  H29. Kárdex: referencias con códigos internos ("ENTRADA_PRODUCCION · Proyecto #157", "RECEPCION_OC"). Mostrar
       "OV-0157 · LOTE-MDF-0016" y el folio de la OC.

  PRODUCCIÓN / ETIQUETAS:
  H26. Piso de Producción: búsqueda que filtre tarjetas por OV, cliente o casa.
  H27. Tarjetas de lote en columnas 1 y 2: mostrar la casa (custom_name, ej. "Piloto, 1"), no solo el producto.
       (Mismo caso que H14 en el calendario.) En Empaque ya se ve bien.
  H30. Empaque: al marcar "Herrajes surtidos" se borran los bultos MDF/Herrajes ya escritos sin solicitar.
  H31. Etiqueta de bulto: falta folio de OV y dirección (calle/lote); la casa debe ir en letra grande junto al número de bulto.
  H32. PDF de etiquetas sale como "untitled": nombrarlo Etiquetas_OV-0157_Piloto-1.pdf (o similar).
  H33. Empaque: "Etiquetas solicitadas" se guarda por instancia (labelsRequestedInstanceIds); la tarjeta de Piedra
       hereda la marca de MDF. Debe ser por instancia + tipo de lote.
  H34. Centro de Impresión: una casa con MDF y Piedra sale en un solo renglón, tipo Piedra con el total de bultos MDF (5).
       Deben ser dos renglones: MDF (bultos) y Piedra (piezas).
  H35. "Descargar Manifiesto" (stone_manifest) falla: "Error al descargar el manifiesto". Revisar logs de
       valentina-pruebas-api (instancia Piloto 1 de OV-0157). El aviso debe mostrar el detalle del servidor.
  H36. Campo → Carga del camión (vista de Dirección): lista todas las cuadrillas desde las más viejas (julio,
       "Programado"). Ordenar por fecha próxima, agrupar por cuadrilla y agregar búsqueda.

  VENTAS / COTIZACIÓN / FACTURACIÓN (hallazgos de la mañana):
  H1.  Captura de cotización muestra Sobreprecio 52.63% en lugar de 45%.
  H2/H4. Centavos distintos entre pantallas (costo unitario $10,398.61 vs $10,398.57; total $31,195.83 vs $31,195.71).
       Unificar redondeo: una sola cifra en todo el sistema.
  H3.  "Saldo vivo" vs "Saldo por cobrar": nombres confusos; proponer nombres claros a Gabriel.
  H5.  Folio de factura debe ser obligatorio.
  H6.  Encabezados de tabla fijos (sticky) en todo el sistema, incluido el encabezado de grupo en reportes agrupados
       y el Kárdex.
  H7.  Reporte CxC muestra importes sin signo $.
  H8.  Tipo de factura sale "ADVANCE" en inglés: traducir.
  H9.  Registro de ingreso (depósito) sin campo de fecha del depósito.
  H12. Bautizo: el campo Calle se precarga con el último valor capturado y sigue editable.
  H13. Modal de edición de instancia con tres botones de guardar: dejar un solo "Guardar".
  H14. Calendario de Planeación: las píldoras muestran solo "Cocina Obra Piloto"; deben mostrar la casa (calle/lote).
  HECHO [2026-10-14 14:25 Mérida] — todo en commits locales con tests (backend 337, frontend 37, build OK).
  NO está en Pruebas ni en producción: Pruebas despliega de `main` (ver pregunta 13:27); sin push hasta que Gabriel
  decida. Prueba en pantalla pendiente: la sesión local venció (Gabriel entra en http://localhost:3000).
  Migración nueva x3y4z5a6b7c8 (probada sube/baja/sube en local).
  - Corregido: H38, D32, H37 (sin iPhone para reproducir: aviso con la causa, código manual, reintentar, no regresa
    a la lista), D29, D30, D31, H18, H20, H21, H22 (además "Quitar partida" ahora sí regresa la solicitud), H23,
    H24, H25 (era el botón "solicitar anticipo"), H29, H26, H27, H30, H31, H32, H33 (además la tarjeta de Piedra
    pisaba los bultos MDF con 1/1), H34, H36, H2/H4 (editor de receta y captura redondeaban cada renglón hacia
    arriba), H3 (aplicada D33: "Falta cobrar del contrato" / "Facturado sin cobrar"), H5, H6, H7 (ya venía en la
    guía), H8, H9, H12 (la calle se queda para la siguiente casa), H13, H14.
  - Pendiente con motivo:
    · H35: no reproducido; el manifiesto de Piloto 1 se genera bien con sus datos. El aviso ya muestra el detalle
      del servidor; si vuelve a fallar, el mensaje dirá la causa (o revisar logs de valentina-pruebas-api).
    · H1: no reproducido con los datos (precio = costo × 1.45 ÷ 0.95, correcto con comisión 5%). 52.63% es el
      sobreprecio sin descontar la comisión. Necesito saber en qué pantalla y con qué usuario salió.
    · D34 (lápiz de renombrar en el Simulador) en DECISIONES_PENDIENTES.
  - Commits pendientes de prueba en pantalla (31): 44e93cd…c933fde (los 5 del 14/10 en la mañana y los 26 de esta
    instrucción; lista en el journal y en `git log origin/main..HEAD`).

- [2026-10-13 13:55] IMPORTADOR DE OVs + VISTA DE OVs CERRADAS (decisiones de Gabriel, 13/10). Prioridad 1 al terminar la copia de Pruebas.
  A. El Excel de migración es la verdad SOLO del dinero de las OVs que contiene: qué OVs existen, facturas, notas de crédito,
     anticipos, abonos y saldo por cobrar. NO lleva recetas, partidas ni nada de producción.
  B. Plantilla: columna "Folio_OV" (el folio que ya tiene la OV en Valentina, p. ej. OV-0117) en las hojas OVs y Facturas.
     Las facturas se ligan por Folio_OV, no por nombre del proyecto. Se descarga desde la app ya llena con las OVs, facturas y
     abonos actuales.
  C. Cada subida sincroniza (el Excel crece en filas; cada subida es la verdad completa):
     - Folio_OV existente: no crea OV. Facturas (por folio) y abonos quedan IGUAL al Excel: lo nuevo se agrega, lo distinto se
       actualiza con bitácora ("Importación <fecha>"), lo que ya no viene se CANCELA con ese motivo. Nunca borrado físico.
     - Folio_OV vacío: OV nueva con su folio. Nunca duplica.
     - Total de una OV que nació en Valentina distinto al del Excel: mostrar como diferencia, no cambiarlo (los cambios de
       total van por orden de cambio).
     - NO toca bancos (el banco se concilia aparte) y NO toca comisiones. Comisiones fuera del Excel por ahora; anota en
       DECISIONES_PENDIENTES la opción de una columna "Comisión pagada" por abono.
     - Vista previa obligatoria antes de aplicar: por OV, qué se agrega, cambia y cancela. Solo DIRECTOR/MANAGER.
  D. El Excel irá aportando menos cada día: las OVs nuevas nacen en Valentina. Mientras una OV venga en el Excel, sus
     facturas y abonos se manejan por el Excel (avisar si alguien intenta capturarlos en la app).
  E. Revisa producción (solo lectura): ¿hay OVs duplicadas por subidas repetidas de la plantilla? Lista; no canceles nada sin
     visto bueno de Gabriel.
  F. Gerencia → "OV y Facturación": separar OVs VIGENTES de CERRADAS. Cerradas = "Pagada (saldo cero)" (y las canceladas en
     su propio filtro). La lista de vigentes ya no las muestra; nada se borra, solo se separan.
  G. Probar primero en Valentina Pruebas (cuando la API esté Live) o en la copia local. Tests, prueba en pantalla, commit;
     push fuera de horario.
  H. El asesor ya generó la plantilla con "Folio_OV" como PRIMERA columna (A) en OVs y Facturas, llena con los 20 folios
     legacy (OV-0115…OV-0145; Luna OV-0115 faltaba en la plantilla). El importador debe aceptar exactamente ese formato.
  I. Posibles duplicados a revisar (solo lectura, reportar): OV-0149 "Cotizacion ICX 1759/ OC 58" ($27,960.64) vs OV-0142
     "SPCH, OC 58 2" ($27,960.64), y OV-0150 "ICX 1762/OC 65" ($13,980.32) vs OV-0144 "SPCH, OC 65" ($13,980.32).
  - **[13/10 14:40 Mérida] Hecho en código (commit local; push fuera de horario):** A–D, F y H como se pidió; 319 tests,
    build OK, migración subir/bajar/subir OK. Descarga "Excel con los datos actuales" (20 OVs legacy, Folio_OV en
    columna A) y al subirlo sin cambios: "SIN CAMBIOS". Facturas sin folio (OV-0122) se ligan por tipo, fecha y monto.
    Tu plantilla, validada contra la copia local, tiene 2 errores: OV-0115 Luna sin Total_OV_con_IVA (fila 21 de OVs)
    y STELLA fila 3 de Facturas Abono2_Fecha «22/05/226». E e I: ver D27 (no hay duplicados por subidas repetidas;
    OV-0142/0144 parecen duplicadas de OV-0149/0150; no se canceló nada). Decisiones nuevas D24–D28.
    G: falta la prueba en pantalla (la sesión local venció) y probar en Pruebas tras el push.
