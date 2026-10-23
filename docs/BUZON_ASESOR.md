# Buzón del asesor de Gabriel

Instrucciones del asesor para Claude Code. Se ejecutan siguiendo `CLAUDE.md` (misma autoridad que las de Gabriel
dentro de esas reglas; nada de producción fuera de lo que CLAUDE.md permite).

Formato: una instrucción por viñeta en "Pendientes". Al terminarla, Claude Code la mueve a "Hechas" con fecha, hora
(Mérida) y resultado breve.

## Pendientes

> REGLA PARA CLAUDE CODE: al terminar una instrucción, mueve a "Hechas" SOLO ese bloque. Las demás instrucciones se quedan en Pendientes.

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

### 23/10 11:58 — HECHO en Pruebas: Viveyuc a Tasa Cero (migración fb91a5ebd149, commit 63b066a). Listo para main
- **Antes:** el despliegue de 9b02cc4 (recetas / "+ Nueva") quedó en producción a las 11:50: pantalla y API con el aviso
  nuevo, migración sin cambio.
- **Migración** con bitácora (10 filas, `change_id viveyuc-fb91a5ebd149`), guarda por valor esperado y bajada desde la
  bitácora.
- **Cifras antes → después:**
| OV | Total c/IVA | Tasa | Subtotal | IVA | Partida "Contrato legacy" | Comisión de la OV | Saldo |
|---|---|---|---|---|---|---|---|
| OV-0123 | $2,620,963.00 = | 16 % → Tasa Cero | $2,259,450.86 → $2,620,963.00 | $361,512.14 → $0 | $2,259,450.86 → $2,620,963.00 | $67,783.53 = | $1,069,968.75 = |
| OV-0124 | $157,551.00 = | 16 % → Tasa Cero | $135,819.83 → $157,551.00 | $21,731.17 → $0 | $135,819.83 → $157,551.00 | $4,074.59 = | $94,530.60 = |
- **Comisiones:** en Valentina no existe ninguna comisión registrada para esas OVs (0 renglones). La comisión de la OV se
  queda igual y no se genera ninguna diferencia ni comisión nueva. Las facturas (CxC) no llevan tasa, así que no cambian.
- **Pruebas:**
  - En la copia de producción: sube, baja y vuelve a subir, y las cifras regresan exactas.
  - En Valentina Pruebas: aplicada a las 11:54, cifras iguales a la tabla.
  - El Excel "datos actuales", generado con el código de exportación sobre la copia, ya da IVA% 0 en OV-0123 y OV-0124.
  - Tests del importador y de recetas: 26 pasan. Una sola cabeza de migraciones.
- **Pase a main:** `! git push origin <commit del buzón>:main` (el último commit de `pruebas`, que incluye 63b066a). Render
  aplica la migración al desplegar. Si hay que regresar: bajar fb91a5ebd149, que restaura desde la bitácora.
- **Karina:** en OVs nuevas de Viveyuc, IVA% = 0 (no EXENTO).

<details><summary>Instrucción original</summary>

#### 23/10 11:52 — Viveyuc: corrección de IVA APROBADA por Gabriel ("aprobado y la comisión ya se pagó")
1. Migración con bitácora y bajada (como ZENARA): OV-0123 y OV-0124 de PROMOTORA VIVEYUC a Tasa Cero (subtotal = total, IVA 0),
   con sus CxC/facturas como corresponda. El total con IVA y lo cobrado NO cambian.
2. COMISIONES: Gabriel ya las pagó. NO cambiar ninguna comisión existente de esas OVs (quedan como están, "pagadas fuera de
   Valentina", con su monto actual). No generar diferencias ni comisiones nuevas por los $11,497.30.
3. Pruebas primero, verificar cifras antes/después, reportar en Hechas y decir el commit para el pase a main (lo hace Gabriel
   con "! git push"). Antes: vigilar que el deploy de 9b02cc4 (receta / "+ Nueva") llegó a producción y confirmarlo.

</details>

### 23/10 11:44 — Viveyuc IVA: revisado (solo lectura). La exportación está bien; el DATO está en 16 %. Corrección PROPUESTA, sin aplicar: espera aprobación
**1. Dónde vive la tasa y qué tiene Viveyuc.**
- La tasa vive en la OV (`sales_orders.tax_rate_id` + `tax_amount`). Las facturas (CxC) y el cliente no tienen tasa.
- El Excel descargado pone en IVA% la tasa de cada OV, así que la exportación no se equivoca: refleja lo guardado.
- Las 8 OVs de Viveyuc capturadas en Valentina tienen "Tasa Cero" (0 %).
- Las 2 que entraron por el Excel quedaron al 16 %: OV-0123 PUERTO PALMERAS, 18 LOTES y OV-0124 PALMAR. Las 19 OVs del Excel
  están todas al 16 %; solo Viveyuc tiene OVs a 0 % fuera del Excel.
- Lo guardó así el importador con lo que traía el Excel original. En producción no existe una tasa llamada "Exento"; solo
  "Tasa Cero".
**2. Exportación:** no hay nada que corregir.
**3. Afectado (el total con IVA y lo cobrado NO cambian; cambia el desglose):**
| OV | Total c/IVA | Subtotal hoy → correcto | IVA hoy → correcto | Comisión 3 % hoy → correcta |
|---|---|---|---|---|
| OV-0123 | $2,620,963.00 | $2,259,450.86 → $2,620,963.00 | $361,512.14 → $0.00 | $67,783.53 → $78,628.89 |
| OV-0124 | $157,551.00 | $135,819.83 → $157,551.00 | $21,731.17 → $0.00 | $4,074.59 → $4,726.53 |
- También cambian la venta sin IVA en Margen neto % y en los reportes, y la comisión de Ventas (+$11,497.30 entre las dos).
- **Propuesta:** migración con bitácora (`change_id`, guarda de valor esperado, downgrade desde la bitácora) que, en esas
  2 OVs, pone tax_rate_id 1→3 (Tasa Cero), tax_amount → 0, subtotal → total y commission_amount → 3 % del subtotal.
- Si alguna comisión ya se pagó o liquidó, primero se revisa eso.
- **DETENIDO: necesito el sí de Gabriel** (sube la comisión).
**4. Si Karina vuelve a subir:**
- En las OVs que ya existen (traen Folio_OV) el importador NO lee el IVA%: no cambia nada ni marca diferencia, diga 16, 0 o
  EXENTO.
- En OVs NUEVAS:
  - IVA% = "EXENTO" da error y no importa, porque no hay tasa "Exento" en producción;
  - IVA% = 0 entra como Tasa Cero (correcto);
  - IVA% = 16 entra al 16 % (el mismo error de hoy).
- Indicación para Karina: en Viveyuc escribir 0, no EXENTO.
- Decisión menor, si Gabriel quiere: que "EXENTO" se tome como Tasa Cero.
**Nota:** OV-0045 y OV-0123 (Puerto Palmeras, mismas facturas 237 y 245) siguen siendo la pregunta abierta D14 con
contabilidad. Si OV-0123 es la buena, la corrección del IVA aplica igual.

<details><summary>Instrucción original</summary>

#### 23/10 11:24 — Migración de OVs: IVA de PROMOTORA VIVEYUC en el Excel descargado (Karina, producción; SOLO LECTURA)
Karina: "Descargar Excel con los datos actuales" pone IVA 16 % a todos los clientes, y PROMOTORA VIVEYUC es IVA EXENTO.
1. Producción solo lectura: ¿las OVs/CxC de Viveyuc en Valentina tienen tasa exenta o 16 %? (¿dónde vive la tasa: OV, factura,
   cliente?). ¿El error está en lo que guardó el importador o solo en la exportación?
2. Si es la exportación: corregir en Pruebas para que el Excel lleve la tasa real de cada OV/factura.
3. Si los datos de Viveyuc están en 16 % en Valentina: listar OVs y montos afectados y proponer la corrección (como migración
   con bitácora) — DETENERTE para aprobación.
4. Antes de que Karina vuelva a subir: ¿un Excel con IVA mal en Viveyuc generaría diferencias o cambiaría algo? (el importador
   no cambia lo existente, pero confirmar para las OVs nuevas).
Reportar en Hechas.

</details>

### 23/10 11:42 — HECHO en Pruebas: receta "nueva" que no se graba (fe05734, b02c875, eae175e). Me DETENGO.
**Qué pasó en producción (solo lectura, bitácora):**
- 08:55 se creó "Mueblo consultorio (Socia)" V1.0 (#443); 09:13 Ventas mandó COT-0100 a revisión.
- 10:58 Gabriel corrigió la receta AL AUTORIZAR COT-0100: se creó #444 "V1.0 (corr. COT-0100)" (MDF blanco 1→1.1, MDF visón
  0.5→1, tapacanto visón 12.5→25, zoclo 1.4→1.5), #443 quedó obsoleta y COT-0100 quedó AUTORIZADA con #444 ($9,323.71).
- No hay ninguna otra versión creada hoy: la "versión nueva" es #444. Como COT-0100 ya está autorizada con ella, #444 también
  está en uso y el bloqueo es correcto. La pantalla no lo decía: mostraba "Lista", dejaba pasarla a Borrador y cambiar
  cantidades, y al grabar salía el mensaje genérico. No graba sobre el id viejo y no es regresión de DesignCatalogPage.
- Además, el botón "Nueva" (clonar) tenía un defecto real: el recuadro "Monitor" quedaba ENCIMA del diálogo y tapaba el campo
  del nombre (capturas 02). Por eso no hay clones hoy.
**Corregido en Pruebas** (tests 384 backend / 59 frontend, build; probado en pantalla con COT-0087):
- La receta en uso dice quién la usa: "Receta en uso por COT-0087 (autorizada)…" y el 409 también nombra el documento.
- Si está en uso, materiales y estatus quedan bloqueados desde que se abre ("usa Nueva para hacer una versión editable").
- El diálogo "Nueva" ya se ve completo; se clonó #417 → #423 en Borrador, se cambió Maquila 7→8 y grabó ($21,873.93).
- Capturas: docs/pruebas_23_10/01–03.
**Cómo hacerlo HOY en producción** (antes del pase a main):
- Si solo quiere una receta editable: abrir la receta, clic en "+ Nueva" y, sin tocar nada, ENTER (el nombre "V2.0" ya
  viene escrito y el campo tiene el foco; el recuadro tapa el diálogo pero Enter lo graba). Se abre la versión nueva en
  Borrador; ahí cambia cantidades y graba. El nombre se cambia con el lápiz.
- Para que COT-0100 tome otra corrección: (1) en COT-0100 "Regresar para cambios" con motivo (Ventas o Dirección; está
  autorizada); (2) Ventas "Solicitar autorización"; (3) Dirección, en la revisión, corrige la receta (cantidades + motivo)
  y autoriza: se crea otra versión que reemplaza a #444 y la cotización queda con ella y con su precio recalculado.
**Cómo una cotización toma la receta corregida y quién:** solo Dirección, al autorizar una cotización en revisión
(corrección de receta en la pantalla de autorización). La versión corregida es nueva, "Lista", con "reemplaza a #…"; la
anterior queda obsoleta e intacta para lo ya vendido. Otra cotización que use la receta vieja muestra "Receta
corregida — la reemplaza …. Actualízala al editar la cotización" (Ventas la cambia al editar). Clonar con "Nueva" NO cambia ninguna cotización: sirve para cotizaciones
nuevas o para que Ventas la elija al editar una cotización regresada.
**Pase a main hecho** (Gabriel, 9b02cc4; producción con el arreglo a las 11:50, sin migraciones). Fuera de alcance, anotado: el clon no copia la
descripción comercial.

<details><summary>Instrucción original</summary>

#### 23/10 11:20 — URGENTE (producción): no se puede grabar una versión NUEVA de receta (Gabriel)
Gabriel quiso corregir cantidades de una receta usada en una cotización en revisión → bloqueo correcto (LOCKED_MESSAGE). Creó una
versión nueva y al grabarla sale el MISMO mensaje: "Esta receta ya se usó en una OV o en una cotización en revisión, autorizada o
convertida; clónala para cambiarla." Una versión recién creada no debería estar bloqueada (design_version_service.update_version /
is_locked), así que sospecho que la pantalla está grabando sobre la versión ORIGINAL (id viejo) o que la "versión nueva" no se
creó como versión aparte. DesignCatalogPage cambió mucho en la tanda 1 (posible regresión).
1. Producción SOLO LECTURA: ver qué versiones se crearon hoy (23/10) en el producto que editó Gabriel, su estado y componentes,
   y qué id intentó actualizar la pantalla (logs de Render si hace falta).
2. Reproducir en Pruebas: receta usada en cotización en revisión → "Crear nueva versión" → cambiar cantidades → grabar.
3. Corregir en Pruebas y decir cómo debe hacerlo Gabriel hoy en producción (pasos en pantalla) mientras pasa a main.
4. Explicar cómo la cotización en revisión toma la receta corregida (versión que reemplaza / "Receta actualizada" en la
   cotización) y quién puede hacerlo.
Reportar en Hechas y DETENERTE.

</details>

### 22/10 16:32 — PASE A MAIN hecho (Gabriel corrió el push: main 177faed → 1e3d631)
- Render: migración 064478e54c17 en producción a las 16:32; API responde; frontend nuevo publicado 16:32.
- Producción (solo lectura), igual que Pruebas: OV-0122 #44 \$255,619.92 / #45 \$214,767.04 con su anticipo aplicado y NC de redondeo
  \$809.96 / \$383.52; 492 y 594 Pagadas; falta cobrar \$342,577.00; OV-0115 sin marca de Excel; 15 cambios en bitácora.
- En producción ya están "Recibir con una factura" y el aviso de folio repetido en OC prepagada.
- Pantalla de producción: pide entrar con usuario real; Gabriel entra para revisar.
- Xaze en producción (lo hace Delmy/Administración): Corregir a 0 el monomando de OC-M260717190517 y OC-M260708174748 (motivo
  "Se recibe con la factura completa 300490") y luego "Recibir con una factura" con las 3 OCs a \$923.58 → CxP \$2,141.06.
- Regreso si algo falla: main a 177faed + bajar 064478e54c17 (probada) o respaldo prod_respaldo_pre_main_20261021_1216.dump.


### 22/10 16:29 — Pruebas en pantalla en PRUEBAS: OK. Listo para el pase a main (lo corre Gabriel)
Capturas en docs/pruebas_22_10/ (01–09).
1+2. Xaze 300490 en el Andén de Pruebas, en dos entregas para probar también "se suma a la misma cuenta":
   - "Recibir con una factura" con OC-M260520233521 (prepagada, muestra "anticipo pagado $1,073.00") y OC-M260717190517, monomando
     a $923.58: subtotal $1,847.16, IVA $295.55, total $2,142.71, anticipos −$1,073.00, por pagar $1,069.71 (02, 03). El aviso
     "el monto de la factura ($3,214.06) no coincide con lo recibido" salió como debe (era una entrega parcial de la factura).
   - Recepción normal de OC-M260708174748 con el mismo folio: aviso "ya tiene una factura con ese folio: $1,069.71 PENDIENTE" y
     el diálogo "lo recibido se suma a su cuenta por pagar pendiente" (04, 05). Andén despejado.
   - Resultado (base de Pruebas, solo lectura): UNA cuenta por pagar 300490 por $2,141.06 (= $3,214.06 − $1,073.00) con nota
     "Factura de varias OCs: OC-M260520233521, OC-M260717190517, OC-M260708174748"; 3 renglones a $923.58; kárdex: 3 entradas a
     $923.58; las 3 OCs Recibida total; anticipo ANT-OC-M260520233521 cerrado como pagado; bitácora "Otra entrega de la
     factura 300490" con $1,069.71 → $2,141.06.
3. Folio repetido en OC prepagada SOLA: no se pudo en pantalla (la única OC prepagada de Pruebas ya entró en la prueba 1);
   queda cubierto por su test automático. El aviso + confirmación de folio repetido sí se vio en la prueba 2.
4. ZENARA en Pruebas: Cuentas por cobrar ya no la muestra (saldo facturado $0) (06). Archivo maestro: falta cobrar
   $342,577.00 y OV-0115 Luna sin la etiqueta EXCEL (07). Rayos X: total facturado $1,457,265.08, total cobrado
   $1,456,071.60, facturado sin cobrar $0.00, falta cobrar $342,577.00, "amortizarán $342,577.00 de anticipo"; avances
   $255,619.92 y $214,767.04 (S/F), 448, 492 y 594 Pagadas (08, 09).
   Visto (no es de hoy, anotado aparte): las fechas de factura importadas se ven un día antes (231 dice 20/04/2025; en la base
   es 21/04/2025 00:00): la fecha se guarda a medianoche y la pantalla la pasa a hora Mérida.
PASE A MAIN: listo. Tests (backend 383, frontend 59), build, una cabeza (064478e54c17), migración probada subir/bajar/subir en la
copia de producción, pantalla en Pruebas. Correr: ! git push origin cd48fff:main
Al desplegar corre en producción la migración de ZENARA/Luna. Para Xaze en producción: Corregir a 0 el monomando de
OC-M260717190517 y OC-M260708174748 y recibir las 3 OCs con "Recibir con una factura" a $923.58.

### 22/10 16:25 — Chrome ya está abierto (Gabriel): hacer las pruebas en pantalla en PRUEBAS
1. "Recibir con una factura" en el Andén de Pruebas con las 3 OCs de BODEGA ELECTRONICA XAZE (OC-M260717190517,
   OC-M260708174748, OC-M260520233521 prepagada): folio 300490, monomando a $923.58. Verificar: total $3,214.06, anticipo
   $1,073.00, por pagar $2,141.06, una sola cuenta por pagar, kárdex al precio real, estados de las 3 OCs.
2. Segunda entrega con el mismo folio (si queda algo parcial) → se suma a la misma cuenta, sin duplicar.
3. Folio repetido en OC prepagada (opción a): avisa y deja confirmar.
4. ZENARA (OV-0122) en Rayos X / Cobranza de Pruebas: cifras del reporte.
Capturas en docs/pruebas_22_10/. Reportar en Hechas y decir si está listo para el pase a main (lo hace Gabriel con "! git push").


### 22/10 14:39 — Punto 4 HECHO en Pruebas: "Recibir con una factura" (b3db49a). Falta la prueba en pantalla
- Andén → botón "Recibir con una factura" → su pantalla ("Regresar al Andén"): proveedor, fecha, folio y monto de la factura
  una vez; casillas con las OCs del proveedor (muestra anticipo pagado); tabla agrupada por OC con pendiente, esta entrega,
  P. unit. real, "No llegará más" e importe; resumen: subtotal, IVA (una vez), total, anticipos y "Por pagar" (o "A favor").
- Servidor: cada OC recibe como siempre (kárdex al precio real, estado, anticipo); UNA cuenta por pagar = total − anticipos
  pagados, ligada a la primera OC con la nota "Factura de varias OCs: …"; si los anticipos cubren todo, factura pagada.
- Entregas parciales con la misma factura (también en la recepción de una OC): si hay una cuenta por pagar pendiente de ese
  proveedor y folio sin pagos, la nueva entrega se SUMA a ella (bitácora "Otra entrega de la factura …"). El aviso de folio
  repetido lo dice antes de confirmar.
- Tests: Xaze 300490 con 3 OCs (una prepagada) a $923.58 → una CxP de $2,141.06 ($3,214.06 − $1,073.00); no mezcla
  proveedores; dos entregas de la misma factura → una CxP. Backend 383, frontend 59, build OK.
- Prueba en pantalla en Pruebas PENDIENTE (extensión de Chrome desconectada; en cuanto se conecte la hago con las 3 OCs de
  Xaze, que en Pruebas siguen como estaban antes de hoy).
- Para Xaze en producción (cuando pase a main): Corregir a 0 el monomando de OC-M260717190517 y OC-M260708174748 (motivo
  "Se recibe con la factura completa 300490") y luego "Recibir con una factura" con las 3 OCs a $923.58.

### 22/10 14:03 — Respuestas de Gabriel sobre Xaze, ZENARA y recepción con varias OCs (en este orden)
1. Opción (a) APROBADA: en una OC pagada por anticipo, folio repetido del mismo proveedor = AVISO, no bloqueo. Pruebas → probar →
   reportar; el pase a main lo hace Gabriel con "! git push" cuando lo autorice (hoy, para que Delmy reciba OC-M260520233521 con
   el folio real 300490).
2. Precio del monomando (factura $923.58/pza; OCs $925.00). Gabriel: "si en la recepción podemos ajustar el precio de cada
   artículo, adelante con que Claude Code lo corrija; si en realidad no se puede hacer ese ajuste, hay que corregir ese error".
   a) Confirmar si la pantalla de recepción permite capturar el precio unitario real y si ese precio llega a la cuenta por pagar
      y al costo del inventario. Si NO llega (o no se puede capturar), es un defecto: corregirlo (Pruebas primero).
   b) Las 2 OCs ya recibidas (OC-M260717190517 y OC-M260708174748, CxP $1,073.00 c/u): dejarlas en $923.58 + IVA = $1,071.35 c/u.
      Preferir que se haga en pantalla con "Corregir" y motivo (dar los pasos a Gabriel/Delmy); solo si la pantalla no recalcula la
      CxP, preparar corrección con bitácora y DETENERTE para aprobación. Producción no se escribe sin aprobación explícita.
   c) La 3ª (OC-M260520233521, anticipo $1,073.00) se recibe a $923.58: explicar qué pasa con la diferencia del anticipo ($1.65 a
      favor) y cómo queda.
   Meta: las 3 cuentas suman exacto la factura 300490 = $3,214.06.
3. ZENARA (21/10 14:05): APROBADO escribir en Pruebas. Reportar cifras antes/después y detenerte antes de producción.
4. APROBADO construir "Recibir varias OCs con una factura" en el Andén (después de 1–3): folio y total una vez, una sola CxP,
   resta anticipos de esas OCs, precio unitario real por renglón, entregas parciales con la misma factura sin duplicar CxP.
   Primero propuesta breve de pantalla y reglas en Hechas; luego construir en Pruebas.
   → 1–3 HECHOS y propuesta del 4 en Hechas (22/10); el 4 se está construyendo.
   → 4 HECHO en Pruebas (ver arriba); falta prueba en pantalla.


### 22/10 14:28 — Avance de "Respuestas de Gabriel 14:03" (puntos 1–3 hechos; 4 propuesta abajo y en construcción)
1. (a) Folio repetido en OC prepagada = aviso: hecho y en Pruebas (08ab033). Test: OC prepagada se recibe con un folio que otra
   OC del mismo proveedor ya registró; queda su factura pagada y el anticipo pagado. Sin cambio el resto (el mismo folio en la
   misma OC se sigue bloqueando). Prueba en pantalla en Pruebas PENDIENTE: la extensión de Chrome está desconectada.
   Para producción: necesita el pase a main (Gabriel con "! git push").
2. Monomando:
   a) La recepción SÍ deja capturar el precio real (columna "P. unit."), y ese precio llega a la cuenta por pagar (subtotal de
      lo recibido + IVA) y al costo del kárdex. No hay defecto que corregir.
   b) "Corregir" en Todas las OCs solo corrige CANTIDAD, no precio. Camino en pantalla (sin escribir yo en producción): en cada
      OC (OC-M260717190517 y OC-M260708174748) → renglón del monomando → "Corregir" → cantidad real 0, motivo "Precio real
      $923.58 (factura 300490)". Cancela su CxP (y la factura #439), saca la pieza del inventario y la OC vuelve a parcial.
      Luego se recibe otra vez con folio 300490 y P. unit. 923.58 → CxP $1,071.35 cada una.
   c) La 3ª (prepagada $1,073.00) recibida a $923.58: su parte es $1,071.35; el anticipo se cierra como pagado y quedan
      $1.65 a favor con el proveedor. Valentina lo muestra en la recepción ("Diferencia a tu favor") pero NO lo guarda como
      saldo a favor: Administración lo descuenta en el siguiente pago a Xaze (o se anota como pendiente de tesorería).
   Meta exacta: recibiendo cada OC por separado, el IVA se redondea por OC: 3 × $1,071.35 = $3,214.05 (1 centavo menos que la
   factura $3,214.06). Con la recepción de varias OCs con una factura (punto 4) el IVA se calcula una vez: $2,770.74 + $443.32
   = $3,214.06 exacto, y la cuenta por pagar queda en $3,214.06 − $1,073.00 anticipo = $2,141.06.
   RECOMENDACIÓN: hacer hoy solo el "Corregir" a 0 de las 2 OCs y recibir las 3 juntas con la pantalla nueva cuando pase a main.
   Si Delmy debe recibir hoy por separado: Corregir + recibir a $923.58, y la #65 con la corrección (a); queda 1 centavo abajo.
3. ZENARA: migración 064478e54c17 aplicada en Pruebas (14:28). Mecanismo del redondeo: NOTA DE CRÉDITO a cliente ligada a la
   factura (ya existe en Valentina), folio "REDONDEO-EFECTIVO", motivo "Descuento por redondeo en efectivo"; no inventa cobro.
   | | Antes | Después |
   |---|---|---|
   | #44 avance efectivo | $127,000.00, anticipo 0, factura 23/06/2026 | $255,619.92, anticipo $127,809.96, factura 23/06/2025, NC $809.96 |
   | #45 avance efectivo | $107,000.00, anticipo 0 | $214,767.04, anticipo $107,383.52, NC $383.52 |
   | #47 / #48 | sin folio, Pendientes | 492 / 594, Pagadas (10/04 y 28/08/2026) |
   | Facturado neto | $1,456,071.60 | $1,457,265.08 ✔ |
   | Anticipo por amortizar | $577,770.48 | $342,577.00 ✔ |
   | Facturado sin cobrar | $0 (aunque #47/#48 decían Pendiente) | $0 ✔ |
   | Falta cobrar del contrato | $21,619.92 | $342,577.00 |
   | OV-0115 Luna "viene del Excel" | sí | no |
   - Abonos sin cambio ($127,000.00 y $107,000.00). 15 cambios en bitácora; la bajada (probada en la copia) lo regresa todo.
   - "Falta por facturar $685,154.00": OV-0122 es histórica sin casas, así que la pantalla de Pendiente de facturar no la
     calcula por casas; el dato es total − facturado bruto ($1,799,842.08 − $1,114,688.08).
   - Ajuste de código: al sincronizar con el Excel, el saldo de la OV resta también las notas de crédito (si no, regresaba a
     $343,770.48). Ojo (fuera de alcance, anotado): fuera del importador, registrar una NC no baja "Falta cobrar del contrato".
   - Producción: la misma migración corre al pasar a main (protegida: solo cambia valores que sigan como hoy).
   Karina: su Excel debe traer ZENARA con estos montos ($255,619.92 y $214,767.04 con su anticipo aplicado, abonos $127,000 y
   $107,000); la NC de redondeo no va en el Excel.
4. PROPUESTA "Recibir varias OCs con una factura" (se construye ahora en Pruebas):
   Pantalla: en el Andén, botón "Recibir con una factura" → su propia pantalla ("Regresar al Andén"):
   - Proveedor (buscador) → sus OCs en tránsito o parciales con casilla; se eligen las que ampara la factura.
   - Folio, fecha de llegada, IVA y monto de la factura (con IVA) UNA vez.
   - Una tabla agrupada por OC: partida, pendiente, recibido, P. unit. real, importe; "cerrar renglón" como hoy.
   - Resumen: subtotal, IVA (una vez sobre el total), total contra el monto de la factura (mismo aviso de diferencia),
     anticipos pagados de esas OCs y "Por pagar".
   Reglas:
   - Solo OCs del mismo proveedor. Cada OC actualiza cantidades, kárdex (con el precio real), estado y su anticipo (como hoy).
   - UNA cuenta por pagar: total de la factura − anticipos pagados de esas OCs; sus renglones guardan su partida de OC.
     Queda ligada a la primera OC (para no confundirse con gasto directo) con la nota "Factura de varias OCs: …".
     Si los anticipos cubren todo: sin cuenta por pagar, factura pagada; lo que sobra se muestra "a favor".
   - Entregas parciales con la misma factura: si ya hay una cuenta por pagar de ese proveedor y folio SIN pagos, la nueva
     recepción se SUMA a ella (con aviso) en vez de crear otra; con pagos, aviso y cuenta nueva como hoy. Aplica también a la
     recepción de una sola OC.
   - Corrección: "Corregir" en Todas las OCs sigue funcionando por renglón y baja la cuenta compartida.

### 21/10 14:05 — OV-0122 ZENARA: preparar corrección de datos (Gabriel confirmó: efectivo cobrado REDONDEADO)
Gabriel: los dos avances en efectivo se cobraron redondeados ($127,000.00 y $107,000.00, como ya está en Valentina).
Preparar (NO aplicar en producción; en Pruebas sí, y para producción como migración que corre al pasar a main, igual que D39):
1. #44: avance $255,619.92, anticipo aplicado $127,809.96, abono $127,000.00 del 23/06/2025; fecha de factura 23/06/2025
   (hoy dice 2026). Diferencia $809.96 = descuento por redondeo en efectivo.
2. #45: avance $214,767.04, anticipo aplicado $107,383.52, abono $107,000.00 del 11/09/2025. Diferencia $383.52 = descuento
   por redondeo en efectivo.
3. #47 folio 492 y #48 folio 594; recalcular estado (deben quedar Pagadas).
4. ¿Cómo registra Valentina un descuento por redondeo para que el saldo quede en $0 sin inventar un cobro? Propón el mecanismo
   existente (nota de crédito, ajuste con motivo…) ANTES de aplicarlo; si no existe, dilo.
5. Resultado esperado OV-0122: facturado/cobrado según los datos de Gabriel, anticipo restante $342,577.00, falta por facturar
   $685,154.00 bruto, saldo vencido $0. Verificar en Pruebas con una copia de esos datos.
6. OV-0115 "Luna": quitarle la marca "viene del Excel" (con bitácora y bajada), en la misma migración.
Bitácora en todo; reportar cifras antes/después y DETENERTE. Después Karina valida de nuevo su Excel (debe traer ZENARA con
los mismos montos que quedarán en Valentina).
   → HECHA en Pruebas 22/10 (ver arriba).


### 22/10 13:52 — XAZE factura 300490: solo lectura en producción, nada cambiado. Propuesta abajo; espero aprobación
1. QUÉ SE CREÓ HOY (capturó Delmy Barrera, 13:43–13:44). La factura 300490 trae 3 "Monomando Teka IN 915" (SKU 539150280),
   uno por cada OC de BODEGA ELECTRONICA XAZE:
   | OC | Antes | Recibido hoy | Después | Cuenta por pagar | Antes reportaba |
   |---|---|---|---|---|---|
   | OC-M260717190517 (#199) | Recibida parcial | 1 monomando a $925 | Recibida total | CxP #397 $1,073.00 ($925 + IVA), pendiente; Alejandrina la abrió y se creó la factura #439 300490 $1,073 pendiente | folio 21770 $1,140.57 |
   | OC-M260708174748 (#171) | Recibida parcial | 1 monomando a $925 | Recibida total | CxP #398 $1,073.00, pendiente | folio 296566 $48,080.84 |
   | OC-M260520233521 (#65) | Enviada, PREPAGADA $1,073 (anticipo pagado 01/06) | NADA (bloqueada) | Enviada | — | — |
   - Inventario: 2 entradas de 1 monomando a $925 (existencia 0 → 2). Sin reservas. Sin pagos sobre #397/#398/#439.
   - Bitácora: cada cambio quedó registrado con Delmy (folio/monto reportado, cantidad, estado, CxP y renglones).
   - El "monto de la factura" que se captura NO crea la deuda: la CxP se calcula con lo recibido (cantidad × costo + IVA). Por eso
     las dos CxP de $1,073 son correctas para un monomando cada una; el monto capturado solo queda como "reportado" en la OC.
   - POR QUÉ BLOQUEÓ LA ÚLTIMA: la OC #65 estaba prepagada ($1,073 = su monomando con IVA). Al recibirla, Valentina registra una
     factura ya pagada con el folio capturado y antes revisa que ese folio no exista para el proveedor; 300490 ya existía (#439,
     de la OC #199). Mensaje: "La factura 300490 ya está registrada para este proveedor." No fue por el monto.
   - Cifras: factura real $3,214.06 − anticipo $1,073.00 = $2,141.06 por pagar. Valentina hoy: $2,146.00 (diferencia $4.94
     porque la factura cobra $923.58 por pieza y la OC dice $925).
2. ¿SE PUEDE DESHACER EN PANTALLA? Sí: Compras → Todas las OCs → abrir la OC → en el renglón del monomando "Corregir" →
   cantidad real 0 + motivo (Administración, Gerencia o Dirección; sin pagos). Regresa el inventario, cancela la CxP y su factura
   (libera el folio) y la OC vuelve a Recibida parcial. No regresa el folio/monto "reportado" de antes (queda 300490 / $1,073).
   PERO NO LO RECOMIENDO: al volver a capturar pasaría exactamente lo mismo (#199 y #171 quedarían igual y la #65 se volvería a
   bloquear), porque Valentina no tiene "una factura → varias OCs".
   RECOMENDACIÓN: no deshacer nada. #199 y #171 están bien. Falta solo recibir la #65. Opciones:
   (a) Corrección de código (propuesta, no aplicada): si la OC está totalmente prepagada, el folio repetido del MISMO proveedor
       se avisa (como ya avisa la pantalla) en lugar de bloquear; la factura pagada de esa OC queda ligada a la misma 300490.
       Después Delmy recibe la #65 con folio 300490 normal. Va a Pruebas y luego a main (necesita tu autorización de pase).
   (b) Recibir hoy la #65 con folio "300490-3" (sin código nuevo); queda la nota de que es la misma factura. Rápido pero el
       folio no es el real.
   Y Administración ajusta la diferencia de $4.94 al revisar la factura (o se deja; es redondeo del precio unitario).
3. UNA FACTURA PARA VARIAS OCs: hoy NO se puede; cada recepción es de una OC y crea su propia CxP. Propuesta (no construida):
   en el Andén, "Recibir varias OCs con una factura": se eligen OCs del mismo proveedor, se captura folio y total UNA vez,
   cantidades por OC; se crea UNA cuenta por pagar con renglones de cada OC (los renglones ya guardan su partida de OC), se
   restan los anticipos de esas OCs y cada OC actualiza su estado. Mismo caso que MIDO 4243/04243 y las entregas parciales con la
   misma factura: hoy la segunda captura del mismo folio se vuelve otra CxP (o se cambia el folio para que pase).
Me detengo. Para seguir necesito: ¿(a) o (b) para la #65?, y si se construye la recepción de varias OCs.

### 22/10 13:52 — URGENTE: recepción mal capturada de BODEGA ELECTRONICA XAZE (producción, hoy). Primero SOLO LEER y reportar.
Gabriel: llegó UNA sola factura, Fact. 300490 por $3,214.06 con 3 artículos que pertenecen a varias OCs de BODEGA ELECTRONICA XAZE.
Al dar la recepción (parcial) de cada OC capturó como monto de factura el importe de cada OC y no el de la factura; en la última
OC Valentina ya no le permitió capturar. Quiere deshacer esas recepciones e intentarlo de nuevo.
1. En producción (solo lectura): listar lo que se creó hoy por esas recepciones: OCs afectadas (folio, estado antes/después),
   partidas y cantidades recibidas, movimientos de inventario, cuentas por pagar / facturas de proveedor (folio, monto),
   anticipos aplicados, bitácora. Decir por qué bloqueó la última (¿folio repetido?, ¿monto menor?).
2. ¿Valentina tiene una forma en pantalla de cancelar/revertir una recepción (mercancía + CxP) con motivo? Si sí, dar los pasos
   para que Gabriel lo haga él. Si no, proponer la reversión exacta (como migración/corrección con bitácora y bajada, igual que
   las de OCs) y DETENERTE para aprobación. Producción solo se escribe con aprobación explícita de Gabriel.
3. Cómo debe capturarse bien: una factura que ampara artículos de VARIAS OCs del mismo proveedor. ¿Valentina lo soporta
   (una factura → varias OCs)? Si no, proponer cómo (p. ej. recibir varias OCs del mismo proveedor en una sola recepción con una
   factura). Relacionado: MIDO folios 4243/04243 y la factura repetida en entregas parciales.


### 21/10 13:33 — OV-0122 ZENARA y OV-0115 Luna (solo lectura en producción; nada cambiado). Karina NO debe dar "Agregar lo que falta" todavía
1. QUÉ TIENE HOY OV-0122 EN PRODUCCIÓN (6 facturas, todas de la importación del 21/09):
   | # | Tipo | Folio | Monto | Anticipo aplicado | NC | Fecha factura | Abono | Estado |
   |---|---|---|---|---|---|---|---|---|
   | 43 | Anticipo | 231 | $899,921.04 | — | — | 21/04/2025 | 25/04/2025 $899,921.04 | Pagada ✔ |
   | 44 | Avance | — | $127,000.00 | 0 | — | 23/06/**2026** | 23/06/2025 $127,000.00 | Pagada |
   | 45 | Avance | — | $107,000.00 | 0 | — | 11/09/2025 | 11/09/2025 $107,000.00 | Pagada |
   | 46 | Avance | 448 | $214,767.04 | $107,383.52 | 109 | 29/01/2026 | 30/01/2026 $107,383.52 | Pagada ✔ |
   | 47 | Avance | — | $214,767.04 | $107,383.52 | 116 | 10/04/2026 | 10/04/2026 $107,383.52 | **Pendiente** |
   | 48 | Avance | — | $214,767.04 | $107,383.52 | 138 | 28/08/2026 | 28/08/2026 $107,383.52 | **Pendiente** |
   Contra los datos de Gabriel:
   - 231 y 448 cuadran.
   - **47 y 48 SON las facturas 492 y 594** (mismo tipo, fecha, monto, NC 116 / 138 y abono); solo les falta el folio. Su estado
     dice Pendiente aunque el abono + anticipo aplicado cubren la factura (saldo $0): se quedó así desde la importación del 21/09.
   - Los dos avances en EFECTIVO están capturados distinto:
     · 44 (Gabriel: $255,619.92 con anticipo aplicado $127,809.96, cobrado $127,809.96, 23/06/2025): Valentina $127,000.00
       sin anticipo aplicado, y fecha de factura 23/06/2026 (año equivocado; el abono sí es 2025). Diferencia cobrada $809.96.
     · 45 (Gabriel: $214,767.04 con anticipo aplicado $107,383.52, cobrado $107,383.52, 11/09/2025): Valentina $107,000.00
       sin anticipo aplicado. Diferencia cobrada $383.52.
     Por eso el anticipo restante en Valentina no es el real: faltan $235,193.48 de anticipo aplicado en 44 y 45.
2. CÓMO EMPAREJA EL IMPORTADOR: primero por folio; si una factura del Excel no encuentra su folio, se empareja con una factura de
   Valentina SIN folio del mismo tipo, misma fecha y mismo monto (cada una se usa una sola vez). Aquí 492 → #47 y 594 → #48:
   el emparejamiento fue CORRECTO (son las mismas facturas), no hay defecto y "Agregar lo que falta" NO las duplicaría ni las
   dejaría faltando. Lo que el reporte dice ("Folio: Valentina — / Excel 492") es justo eso: falta capturar el folio.
   El importador nunca escribe sobre lo que ya existe, así que el folio no lo pone él.
   Propuesta (no aplicada): que el reporte lo diga claro: "Falta el folio en Valentina: capturar 492". La regla de emparejar sin
   folio se queda (con tipo + fecha + monto exactos es la misma factura; sin ella se duplicarían).
   Para corregir OV-0122 (a mano en la app, con motivo, o como corrección preparada para producción si Gabriel prefiere):
   folio 492 en #47 y 594 en #48 (quedan Pagadas al recalcular); #44 y #45 con los montos y anticipo aplicado reales y la fecha
   de #44 a 23/06/2025. Esto lo decide Gabriel; no toqué nada.
3. OV-0115 "Luna": no se creó desde un Excel; la capturó el Ing. a mano como OV histórica el 11/09 (antes del primer Excel del
   14/09). Sale como "No viene en el Excel" porque al crear la marca "viene del Excel" se marcaron TODAS las OVs históricas.
   Es la única así (las otras 19 marcadas sí las creó el Excel de Karina).
   Propuesta: corrección de datos que le quite la marca solo a OV-0115 (con bitácora y bajada), como D39, aplicada al pasar a
   main; desde ahí el reporte solo marca OVs que alguna vez vinieron en un Excel. Alternativa: que Karina la incluya en su Excel.
Me detengo. OJO antes de "Agregar lo que falta": si el Excel trae los dos avances en efectivo con sus montos reales
($255,619.92 y $214,767.04 sin folio), NO se emparejan con #44/#45 (montos distintos) y el importador los AGREGARÍA como
facturas nuevas (duplicado). En la vista previa deben verse como "Agrega factura sin folio … " de OV-0122. Si aparecen,
primero corregir #44/#45 en Valentina (o pasarme el Excel y lo reviso). 492 y 594 no se duplican.

### 21/10 13:35 — Migración de OVs (Excel de Karina, producción): revisar OV-0122 ZENARA ANTES de que Karina agregue (solo lectura)
Karina validó "plantilla-migracion-ov-con-folio Oct.xlsx" en producción: 0 errores, 31 avisos, 12 diferencias. El reporte marca en
OV-0122 dos diferencias: "Factura sin folio AVANCE $214,767.04 — Folio: Valentina — / Excel 492" y lo mismo con "Excel 594".
Datos reales de Gabriel para OV-0122 (total $1,799,842.08):
- Anticipo fact. 231 $899,921.04, pagado 25/04/2025.
- Avance fact. 448 $214,767.04, NC 109 $107,383.52 (anticipo), pagada 30/01/2026.
- Avance fact. 492 $214,767.04, NC 116 $107,383.52, pagada 10/04/2026.
- Avance fact. 594 $214,767.04, NC 138 $107,383.52, pagada 28/08/2026.
- Avance en EFECTIVO (sin factura) $255,619.92, anticipo aplicado $127,809.96, pagado 23/06/2025.
- Avance en EFECTIVO (sin factura) $214,767.04, anticipo aplicado $107,383.52, pagado 11/09/2025.
(Cuadra: facturado/cobrado $1,457,265.08; falta por facturar $685,154.00 bruto con $342,577.00 de anticipo restante.)
Hacer (producción SOLO LECTURA; el Excel lo tiene Karina, pídeselo a Gabriel si lo necesitas):
1. Listar qué CxC/facturas tiene hoy OV-0122 en producción (folio, tipo, monto, NC, abonos, fechas) y compararlo con la lista de arriba.
2. Explicar cómo empareja el importador una factura del Excel con una de Valentina sin folio. Si 492 y 594 se emparejaron con la
   factura sin folio (que es el avance en efectivo del 11/09/2025), la importación NO las agregaría y quedarían faltando: es un
   defecto. Proponer la corrección (una factura sin folio en Valentina no debe absorber facturas con folio del Excel).
3. Pregunta aparte: OV-0115 "Luna" sale como "No viene en el Excel — revisar" porque se creó directo en Valentina (no es legacy).
   Proponer que el reporte no marque así las OVs creadas en Valentina.
Reportar en Hechas y DETENERTE. No cambiar datos de producción. Gabriel le dirá a Karina si puede dar "Agregar lo que falta".


### 21/10 12:25 — PASE A PRODUCCIÓN, FASE 2. Hecha (falta solo la revisión en pantalla con sesión de Gabriel)
- Respaldo de producción antes de subir: ~/valentina_local/dumps/prod_respaldo_pre_main_20261021_1216.dump (solo lectura).
- main 081b2ab → 177faed (avance rápido; el push lo corrió Gabriel porque el permiso de Claude Code bloquea despliegues a producción).
- Render: migración en producción 2ecb8aa6be05 a las 12:19; API responde; frontend nuevo publicado 12:19.
- Cifras en producción (consulta de solo lectura) IGUALES al ensayo: globales Lic. 19 · $47,978.39 pagadas fuera; Ing. 18 ·
  $46,348.04 omitidas; vendedor pagadas fuera Lic. 14 · $57,795.96, Ing. 3 · $32,961.12, Sahía 1 · $300.00; MIDO $26,212.49
  Recibida total; CERRAJES $12,445.80; bitácora 110 / 72 / 3; beneficiario global Lic., 2 %.
- Pantalla: producción pide entrar con usuario y contraseña reales; no entro con ellas. Gabriel entra y reviso solo leyendo.
- Regreso si algo falla: main a 081b2ab (Render despliega) + restaurar el respaldo de arriba (las migraciones tienen bajada
  probada en el ensayo, sin pérdida de cifras).

### 21/10 11:55 — PASE A PRODUCCIÓN (main) AUTORIZADO POR GABRIEL HOY, en horario laboral. Dos fases; NO saltar la fase 1.
Antes de todo: commit y push a `pruebas` del journal.txt pendiente (cierre del asesor 20/10).

FASE 1 — Preparar y ensayar (sin tocar producción):
1. Lista en lenguaje sencillo de lo que cambia de main (081b2ab) a pruebas: decisiones/funciones, correcciones, pantallas.
2. Lista de migraciones que se aplicarán en producción, en orden, y qué hace cada una con datos (D39, D44 omitidas, totales
   MIDO/CERRAJES, D21, D40, D41, etc.).
3. Ensayo: copia FRESCA de la base de producción (solo lectura, pg_dump) restaurada en local (neutralizar SMTP como siempre);
   aplicar todas las migraciones (upgrade head) y verificar cifras esperadas: comisiones marcadas por D39 (Lic. 19 por
   $47,978.39 pagadas fuera; Ing. 18 por $46,348.04 omitidas; vendedores), totales de las 2 OCs, que la app arranque y que las
   pantallas principales carguen con esa copia. Reportar cualquier error.
4. Variables de entorno nuevas que necesite Render producción (si las hay).
5. Reportar todo en "Hechas" y DETENERTE. El asesor revisa con Gabriel.
   → FASE 1 HECHA 21/10 12:05 (ver Hechas); falta solo revisar pantallas cuando Gabriel entre en localhost:3000.

FASE 2 — Solo cuando Gabriel escriba "adelante con la fase 2":
respaldo de la base de producción (pg_dump con fecha en ~/valentina_local/dumps), merge de pruebas a main (fast-forward si se
puede), push, vigilar el deploy de Render (API y frontend), confirmar que la migración corrió, revisar en producción en pantalla
(solo leer, sin registrar nada) las cifras del ensayo. Si algo falla: decir cómo regresar (main anterior 081b2ab + respaldo).
   → FASE 2 HECHA 21/10 12:25 (ver arriba).

### 21/10 12:05 — PASE A PRODUCCIÓN, FASE 1 (preparar y ensayar). Hecha salvo la revisión en pantalla (falta que Gabriel entre)
Antes de todo: journal del 20/10 ya estaba en `pruebas` (d3e614c). Main (081b2ab) → pruebas: 127 commits, avance rápido posible.

1. QUÉ CAMBIA (en sencillo)
   Decisiones y funciones:
   - Comisiones: se pagan desde Gerencia → Nómina → Comisiones con Banco, Efectivo (caja chica) o Efectivo Dirección (D40),
     o repartido entre ellos; cada cobro genera comisión del vendedor (anticipo y avances) (H57, H65, H67–H69, D37).
   - D39: todas las comisiones anteriores quedan "Pagada fuera de Valentina". D44: la comisión global es de un solo
     beneficiario (Lic., 2 %) configurable en Configuración; las globales duplicadas del Ing. quedan "Omitidas"; la
     rentabilidad de OV y el tablero de Dirección restan la comisión global.
   - D41: Gerencia ya no ve bancos, no registra cobros ni pagos a proveedor, solo ve caja chica, no paga nómina/comisiones.
   - D21: ruta "Lo pone el cliente" y material PIEDRA DEL CLIENTE ($0, no se compra ni lleva existencia).
   - D36/D35: factura de avance por casa completa con IVA y anticipo proporcional amortizado.
   - D29–D34: bautizo solo Ventas; no se crea lote si falta MDF/piedra; solicitudes ligadas a OV; carga del camión con
     hoy y el siguiente día hábil.
   - Ayuda "?" en cada pantalla y buscador "¿En qué te ayudo?" (D38); Costo_OV en el importador; #receta.
   Correcciones (H): calendario y cuadrillas (H38, H39, H42), centro de impresión (H45, H56), Campo (H37, H40, H41, H43,
   H60), cobranza y tesorería (H3, H5, H8, H9, H46, H47, H63), compras (H20–H25, H29), producción (H26, H27, H30, H33),
   costos de receta (H2/H4), cotización (H1). Del 20/10: "Ver PDF oficial" de OC, solicitud automática duplicada,
   total de OC al editar una partida, categoría MATERIALES al generar OC.
   Pantallas: guía segunda ola y tanda 1 de la tercera (Antigüedad, Cobranza, Clientes, Caja chica, Campo, Diseño, Compras,
   Andén, Piso de producción, Gerencia/Nómina, Tesorería, Pendiente de facturar); colores de material; sub-tarjetas;
   fechas Creada/Autorizada en OCs; filtros del Andén.

2. MIGRACIONES QUE CORRERÁN EN PRODUCCIÓN (producción hoy en w2x3y4z5a6b7), en orden:
   1) x3y4z5a6b7c8 — campos nuevos: OV en solicitudes y partidas de OC, solicitud de origen, OC en el kardex. Sin cambiar datos.
   2) y4z5a6b7c8d9 — H56 seguimiento de etiquetas/manifiestos pedidos. Rellena casas con carril pendiente: en producción 0.
   3) z5a6b7c8d9e0 — forma de pago de comisiones y nómina (campos nuevos). Sin cambiar datos.
   4) a6b7c8d9e0f1 — D39: TODA comisión no pagada → "Pagada fuera de Valentina", sin movimiento de banco ni caja, con bitácora.
   5) b7c8d9e0f1a2 — D40 detalle de pago repartido (campo nuevo).
   6) 5cd6e914c375 — D21 ruta CLIENTE y crea el material PIEDRA DEL CLIENTE.
   7) 969c63689777 — D44 beneficiario de la global en Configuración: Lic. Gabriel Frías García, 2 %.
   8) dcab654921ee — D44/D39: globales de quien no es beneficiario (Ing.) regresan a no pagadas y quedan "Omitidas".
   9) 2ecb8aa6be05 — totales de OC MIDO y CERRAJES (cuentas por pagar NO se tocan).

3. ENSAYO con copia fresca de producción (pg_dump solo lectura 21/10 11:54, base local aparte `valentina_ensayo`, SMTP borrado):
   upgrade head sin errores. Cifras después:
   | Comisiones | Antes | Después |
   |---|---|---|
   | Lic., globales | 19 · $47,978.39 sin pagar | 19 · $47,978.39 pagadas fuera ✔ |
   | Ing., globales | 18 · $46,348.04 sin pagar | 18 · $46,348.04 omitidas (no pagadas) ✔ |
   | Lic., vendedor | 14 · $57,795.96 | pagadas fuera |
   | Ing., vendedor | 3 · $32,961.12 | pagadas fuera |
   | Sahía Patrón, vendedor | 1 · $300.00 | pagada fuera |
   - OC-M260807225203 MIDO: $50,082.75 Recibida parcial → $26,212.49 Recibida total ✔.
     OC-M261006223132 CERRAJES: $15,712.80 → $12,445.80 ✔.
   - Bitácora: 110 cambios D39, 72 D44, 3 de OCs. Beneficiario global: Lic., 2 %. PIEDRA DEL CLIENTE creada.
   - Regreso probado: downgrade completo a w2x3y4z5a6b7 dejó las cifras exactamente como antes; upgrade otra vez igual.
   - Tests backend 378 ✔, frontend 55 ✔, build ✔, una sola cabeza (2ecb8aa6be05), tsc sin errores nuevos (147, igual que antes).
   - La app arranca con esa copia (API y pantalla de entrada). FALTA revisar las pantallas principales: es una copia de
     producción con contraseñas reales y no entro con contraseñas ajenas; Gabriel entra en http://localhost:3000 (está
     apuntando al ensayo, no a producción) y sigo yo.
   - Nada de error en el ensayo.

4. VARIABLES DE ENTORNO NUEVAS para Render producción: ninguna (sin cambios en config, dependencias ni variables VITE_).

5. Me detengo aquí. Fase 2 solo con "adelante con la fase 2". Regreso si algo falla: main anterior 081b2ab + respaldo del día.

### 20/10 18:00 — Tres instrucciones de Gabriel (se escribieron 16:59–17:08 y se perdieron del buzón al guardar; hacerlas en este orden)

A. Tanda 1, Andén (aprobado): "Confirmar ingreso" se queda en índigo. En la lista del Andén agregar buscador por folio o proveedor
   (sin mayúsculas ni acentos) y filtro por estado, en su propia tarjeta de filtros como Cobranza. Solo filtran en pantalla.

B. Tanda 1, Piso de producción — colores. Gabriel: "nos quitó los colores que representan al MDF y a la Piedra, es más fácil con
   los colores de los lotes". Regla para la guía: los colores de MATERIAL son información y se conservan en todo Valentina:
   MDF = ámbar, Piedra = violeta (bloqueado/urgente = rojo). Restaurar en tarjetas de lote e instancia lo de antes de la tanda 1
   (530bb15, ProductionKanbanPage ~573 y ~903): MDF bg-amber-50 border-amber-100 border-l-4 border-l-amber-500; Piedra
   bg-violet-50 border-violet-100 border-l-4 border-l-violet-500; etiqueta del tipo amber-100/700 y violet-100/700.
   Revisar si Diseño/Lotes, Campo o Simulador perdieron esos colores y restaurarlos igual.
   Además: columna "Listo para instalarse" con EXACTAMENTE el verde de antes (530bb15 ~1055–1101): columna bg-emerald-50 borde
   emerald-200; título text-emerald-800 con CheckCircle2; contador bg-emerald-200 text-emerald-800; vacío punteado emerald-200 y
   texto emerald-500; cada OV con borde emerald-200, renglón bg-emerald-100 (hover emerald-200), folio emerald-800, proyecto
   emerald-600, contador bg-emerald-200 text-emerald-800. Sin tonos nuevos. Captura docs/ola3_tanda1/produccion_colores.jpg.

C. Regla de navegación con sub-tarjetas (para TODO Valentina; agregar a la guía). Gabriel no quiere pantallas que muestren
   sub-tarjetas Y debajo el contenido de la tarjeta elegida (ej. Gerencia → Nómina → Comisiones: Retenidas / Por pagar /
   Histórico con la tabla abajo).
   - Una pantalla con sub-tarjetas muestra SOLO las tarjetas.
   - Clic en una tarjeta → su propia pantalla con encabezado estándar y "Regresar a <pantalla de tarjetas>".
   1. Aplicarlo ya en las pantallas de la tanda 1 con ese patrón (Comisiones, Destajos, Nómina semanal, Pendiente de facturar,
      Diseño, Compras, otras). Solo navegación/apariencia: mismos datos, botones, permisos y flujos.
   2. Listar en el reporte las pantallas de tandas 2 y 3 con el mismo patrón.
   3. Solo reportar, no cambiar: en Comisiones → Retenidas aparece OV-0055 "Cerrada 17", Ing. Gabriel Frías, $22,782.36,
      102 días. ¿Vendedor o DIRECTOR_GLOBAL? Si es global del Ing., ¿por qué no quedó omitida con D44? ¿La omisión dejó fuera
      las retenidas? ¿Cuántas en Pruebas y en producción?
   Capturas docs/ola3_tanda1/subtarjetas_*.jpg.

Reportar cada letra en Hechas por separado. IMPORTANTE: antes de guardar el buzón, vuelve a leerlo del disco; el asesor
escribe en él mientras trabajas y al guardar una copia vieja se pierden sus instrucciones.
HECHO A [20/10 18:06, Pruebas, commit 8a83fec; captura docs/ola3_tanda1/anden_filtros.jpg]: "Confirmar ingreso" queda en
índigo. Lista del Andén con tarjeta de filtros (como Cobranza): buscador por folio o proveedor sin mayúsculas ni acentos
("bodega" deja las 3 de BODEGA ELECTRONICA) y filtro Estado (Todos, En tránsito, Entrega parcial, Prepagada). Solo en
pantalla; si nada coincide: "No hay órdenes con los filtros seleccionados."

HECHO B [20/10 18:06, Pruebas, commit 868c432; captura docs/ola3_tanda1/produccion_colores.jpg]: Piso de producción con los
colores de material de antes: tarjetas de lote (Por producir, En producción) e instancia (Empaque, Listo) MDF
bg-amber-50 border-amber-100 border-l-4 border-l-amber-500, Piedra bg-violet-50 border-violet-100 border-l-4
border-l-violet-500, bloqueado rojo (bg-red-50 border-red-300, folio rojo); etiqueta del tipo amber-100/700 y violet-100/700.
"Listo para instalarse" con exactamente el verde de 530bb15 (columna, título con CheckCircle2, contador, vacío punteado,
agrupador por OV con renglón emerald-100/hover emerald-200, folio emerald-800, proyecto emerald-600, contador). Revisados:
Diseño → Lotes SÍ los había perdido (restaurado igual); Simulador los conservó; Campo no los usaba. Regla en la guía §8.

HECHO C [20/10 18:06, Pruebas, commit 35e50dc; capturas docs/ola3_tanda1/subtarjetas_*.jpg]:
1. Aplicado en tanda 1 (solo navegación/apariencia):
   - Gerencia → Nómina → Comisiones: solo las 3 tarjetas; Retenidas / Por pagar / Histórico abren cada una su pantalla
     ("Comisiones retenidas", "Comisiones por pagar", "Histórico de comisiones") con "Regresar a Comisiones".
   - Destajos: igual ("Destajos sin firma", "Destajos por pagar", "Destajos pagados", "Regresar a Destajos").
   - Pendiente de facturar: solo sus tarjetas; "Anticipos por facturar" y "Avances de obra por facturar" abren su pantalla
     con buscador y tabla ("Regresar a Pendiente de facturar"); la de Derecho a facturación es solo cifra.
   - Nómina semanal, Diseño y Compras ya cumplían (sus tarjetas se reemplazan por la sección con "Regresar a …").
   Regla agregada a la guía §12.
2. Tandas 2 y 3 con el patrón (tarjetas o pestañas que cambian el contenido de abajo):
   - Tarjetas + contenido: /director → Liquidez (Bancos / CxC / Inventario / CxP con su desglose abajo) y → Eficiencia
     (Overhead / Nómina producción / Piezas, desgloses abajo). (AccountsPayablePage también, pero es código muerto: sin ruta.)
   - Pestañas + contenido: Cuentas por cobrar → Archivo maestro (Vigentes / Cerradas / Canceladas); /director/audit
     (Eventos / Cambios por campo); /inventory/valuation (Materia prima / En proceso / Terminado / Negativas); /planning
     (Mes / Semana / Día / Agenda) y su panel lateral (Críticos, Alertas…); Rayos X → Entregables (Por instancia / Por casa);
     Nueva cotización y Agregar partidas (Catálogo / Manual / Reventa); Cliente (General / Contactos).
   - Duda: Campo → Detalle de casa (tanda 1) tiene pasos en pestañas (Empaque, Herrajes, Plano, Fotos, Trabajo terminado,
     Firma). Es el flujo de la casa en el teléfono; no lo cambié. ¿Se deja así?
   - No aplica (filtros de una misma lista): Todos/MDF/Piedra del Piso, Seguimiento de OV, Estado de cuenta y Pagos a
     proveedor.
3. OV-0055 "Cerrada 17" en Retenidas (solo reporte, nada cambiado): NO es una comisión guardada ni DIRECTOR_GLOBAL. Es la
   estimación PROVISIONAL de la comisión de VENDEDOR que Retenidas muestra para cada OV "Esperando anticipo": venta sin IVA
   $759,412.00 × 3 % = $22,782.36, a nombre del usuario de la OV (Ing. Gabriel Frías, rol DIRECTOR), días desde que se creó
   la OV (10/07 → 102 d). D44 omite comisiones guardadas; esta no existe hasta que se cobre el anticipo.
   La omisión de D44 SÍ incluyó las retenidas: las 22 globales guardadas del Ing. están omitidas (19 retenidas $46,919.41 y
   3 liberadas $380.92); ninguna aparece en bandejas.
   Provisionales en Retenidas (igual en Pruebas y producción): Ing. Gabriel Frías 1 (OV-0055, $22,782.36); Lic. Gabriel Frías
   García 3 ($22,231.02: OV-0046, OV-0151, OV-0152).
   Pregunta para Gabriel: ¿el vendedor de OV-0055 es el Ing.? Si no, se corrige el vendedor de la OV (decisión de negocio).
   Cuando se cobre el anticipo, se generará su comisión de vendedor al 3 % para quien esté como vendedor.

### 20/10 16:43 — Generar OC: categoría de gasto prellenada + solicitud duplicada (Gabriel aprobó ambas)
1. Generar OC (desde solicitudes): "Categoría de gasto" viene prellenada con MATERIALES y se puede cambiar; ya no bloquea el
   botón. OC directa: se sigue pidiendo obligatoria (puede ser gasolina, servicio, maquila…). No cambiar las categorías ni el
   reporte semanal de Tesorería.
2. BUG: en Generar OC, CERRAJES MEXICO SA DE CV muestra dos renglones idénticos del SKU 0502-004 "Tornillo sinker PH plano ngr
   #8 x 1 1/2", 20 piezas cada uno, ambos "Alarma del sistema". Investigar por qué la alarma de stock mínimo creó dos
   solicitudes (¿se dispara en cada carga/consulta? ¿falta revisar si ya hay una abierta para ese material?). Corregir para que
   exista a lo más UNA solicitud automática abierta por material (si ya hay una abierta o en OC no autorizada, no crear otra).
   En Pruebas: cancelar el duplicado con bitácora y motivo "Duplicado de alarma automática". Reportar la causa y cuántos
   duplicados había en Pruebas y en producción (solo lectura en producción).
AVANCE [20/10 17:04, commit 069db2e; queda en Pendientes por el paso de datos]:
1. Hecho: Generar OC prellena "Categoría de gasto" = MATERIALES (se puede cambiar; ya no bloquea); OC directa sigue vacía y
   obligatoria. Categorías y reporte semanal sin cambios.
2. Causa: las dos solicitudes (26 y 27, material 0502-004) se crearon en el MISMO segundo el 04/09/2026 23:25, cuando tres
   pantallas evaluaban la alarma al mismo tiempo; el candado (un solo cálculo a la vez) se agregó el 10/10 (66f5483), y
   desde entonces no se repite. Además ahora: a lo más una automática por material — no se crea si ya hay una abierta
   (pendiente, en compra o aplazada) ni si el material está en una OC sin autorizar (borrador), aunque esa OC no alcance el
   mínimo. Con test.
   Duplicados: Pruebas 1 par abierto (26/27); producción 0 abiertos (ese mismo par existe pero ya está cerrado, PROCESADA,
   porque el stock subió; no hay OC con 40 piezas por él).
   FALTA: cancelar la 27 en Pruebas con motivo "Duplicado de alarma automática". El modo automático de Claude Code bloqueó
   la escritura en la base de Pruebas (CLAUDE.md pide aprobación explícita de Gabriel para INSERT/UPDATE). Script listo
   (verifica que no sea producción, cambia solo la 27 a CANCELADA con bitácora y motivo); en espera de que Gabriel lo apruebe.
HECHO [20/10 17:17, Pruebas]: Gabriel aprobó (20/10). Solicitud 27 cancelada en Pruebas (CANCELADA, bitácora con motivo
"Duplicado de alarma automática"); la 26 sigue pendiente. Producción: nada que cancelar (0 duplicados abiertos).

### 20/10 16:53 — Revisar OC-M260807225203 (MIDO MARMOL Y GRANITO) en "En recepción" (Gabriel)
En pantalla muestra 2 partidas QUA-DUMONT (1/1 recibidas: $14,277.36 y $11,935.13 = $26,212.49) pero el Subtotal dice $50,082.75
(Total $58,095.99) y la OC sigue como recepción parcial aunque no falta nada visible. Diferencia $23,870.26.
Investigar en Pruebas (y solo lectura en producción): qué partidas tiene la OC (canceladas, quitadas, sin material, ocultas),
de dónde sale total_estimated_amount y por qué el estado no pasó a recibida completa. Reportar la causa ANTES de corregir datos.
Si es un defecto de código (total que no se recalcula al quitar/cancelar partidas, o estado que no se actualiza), proponer la
corrección. Revisar igual las demás OCs de "En recepción" (p. ej. OC-M260717190517 BODEGA ELECTRONICA XAZE: verificar que su
subtotal $5,405.00 cuadre con sus partidas).
HECHO — investigación [20/10 17:04; solo lectura en producción; commit e9053db con la corrección de código]. Datos NO
corregidos (espera aprobación de Gabriel).
- OC-M260807225203 (MIDO, id 257), igual en Pruebas y producción: 2 partidas activas (QUARCITA DUMONT 1 × $11,935.13 y
  1 × $14,277.36 = $26,212.49), ninguna cancelada ni oculta. El total guardado $50,082.75 = $14,277.36 + 3 × $11,935.13: la
  partida de $11,935.13 se cobró como si fueran 3. Es de agosto, antes de la bitácora automática: no hay rastro de quién
  cambió la cantidad, pero el patrón es el mismo defecto de abajo (cantidad editada sin recalcular el total).
  Estado: las 2 partidas están 1/1 recibidas; el código actual la pasaría a "Recibida total" en la siguiente recepción —
  el estado parcial viene del código de agosto.
  OJO, dinero: la OC tiene 3 cuentas por pagar del 10/08, todas "PAGADO": #218 folio 4243 $33,123.48 (pagos $33,123.48),
  #219 folio 4243 $27,689.50 (sin pagos registrados) y #220 folio 04243 $27,689.50 (pagos $27,689.50). La #219 y #220 son el
  mismo importe con folio 4243/04243 (captura duplicada). Pagado en Valentina: $60,812.98 contra $58,095.99 del total viejo de
  la OC y $30,406.49 con IVA de lo recibido según las partidas. Recomiendo que Administración lo revise con las facturas
  físicas de MIDO antes de tocar nada.
- OC-M260717190517 (BODEGA ELECTRONICA): cuadra, $5,405.00 = sus partidas; 1 partida pendiente real. OC-M260708174748:
  cuadra ($42,374.00); 1 pendiente real.
- Revisé TODAS las OCs: hay una más que no cuadra, OC-M261006223132 (CERRAJES, Recibida total): total $15,712.80 contra
  partidas $12,445.80. La bitácora muestra la causa: el 07/10 18:22 se editó la partida 807 de 100 a 50 piezas
  (50 × $65.34 = $3,267.00, la diferencia exacta). Su factura 2818 sí es por $12,445.80 + IVA (correcta).
- Defecto de código (corregido, commit e9053db, con test): editar cantidad o precio de una partida NO recalculaba el total
  de la OC (H23 solo cubría quitar y cancelar). Ahora se recalcula siempre.
- Propuesta de corrección de datos (requiere tu aprobación; Pruebas y después producción por migración con bitácora):
  OC-M260807225203 total → $26,212.49 y estado → Recibida total; OC-M261006223132 total → $12,445.80. Las cuentas por pagar
  de MIDO NO se tocan hasta que Administración confirme.
  APROBADO por Gabriel (20/10): Pruebas sí; producción sin escribir, como corrección al pasar a main (igual que D39).
  HECHO [20/10 17:17]: migración 2ecb8aa6be05 (commit ef773bc), solo esas dos OCs y solo si el total aún no cuadra, bitácora
  por campo, bajada restaura. Probada en la copia local (subir, bajar, subir, y no cambia lo ya corregido). Pruebas ya la
  aplicó: MIDO $26,212.49 y Recibida total; CERRAJES $12,445.80. Producción la aplicará al pasar a main.

### 20/10 16:48 — BUG: "Ver PDF oficial" de la OC no abre (Gabriel)
Causa probable (revisada por el asesor): PurchaseOrdersModule.openPdf (~979) y AllPurchaseOrdersModule (~331) abren
`/purchases/orders/{id}/pdf?token=...` con window.open, pero el endpoint usa allow(PURCHASING_ROLES) con el token del encabezado
Authorization (OAuth2), no por query → 401. Probablemente roto desde los cambios de seguridad (4d0963bd / 4b14c0ff).
Corregir: descargar el PDF con axiosClient (responseType blob, con el token normal) y abrirlo con un object URL en pestaña nueva
(o descargarlo si el navegador bloquea la ventana). NO aceptar token por query. Revisar que no haya otros PDF/archivos abiertos
igual en el frontend. Probar en Pruebas con una OC autorizada (Autorizadas, En espera de anticipo, Todas las OCs). Reportar en Hechas.
HECHO [20/10 17:04, Pruebas, commit 86bac08]: causa confirmada — el botón abría /purchases/orders/<id>/pdf?token=… con
window.open y el endpoint solo acepta la sesión en el encabezado Authorization → 401. Ahora "Ver PDF oficial" descarga el PDF
con axiosClient (blob, sesión normal) y lo abre en pestaña nueva; si el navegador bloquea la pestaña, lo descarga. Utilería
común utils/openPdf.ts usada en Órdenes de compra (Autorizadas, En espera de anticipo, En recepción) y en Todas las OCs. El
backend NO acepta token por query (sin cambios). Revisado todo el frontend: no queda ningún "?token=" ni otro archivo del API
abierto con window.open (Cotizaciones, OV y reportes ya usaban blob; los planos son ligas externas). Probado en Pruebas:
Autorizadas (OC-M261009174812) y detalle en Todas las OCs (OC 362): se abre el PDF. No hay captura: la extensión no puede
fotografiar una pestaña blob.

### 20/10 16:36 — Tanda 1, Órdenes de compra: fechas de la OC (Gabriel)
1. Mesa de control (por autorizar): en el encabezado de cada OC (renglón índigo, junto al folio) mostrar "Creada el DD/MM/AAAA"
   (y quién la creó, si el dato existe).
2. Autorizadas y demás vistas posteriores: hoy dice solo "Autorizó: <nombre>". Mostrar "Autorizada por <nombre> el DD/MM/AAAA HH:MM"
   (hora de Mérida). El backend ya guarda authorized_by y authorized_at al autorizar (purchase_service ~282); verificar que se
   graben en Pruebas y que lleguen al frontend. Si falta authorized_at en OCs viejas, mostrar solo el nombre.
3. Todas las OCs: columnas "Creada" y "Autorizada" (fecha), ordenables.
4. [16:45] Autorizadas muestra "Autorizó: Lic. Gabriel Frías García — UserRole.DIRECTOR": quitar el texto técnico del rol. Debe quedar
   "Creada el DD/MM/AAAA · Autorizada por Lic. Gabriel Frías García el DD/MM/AAAA HH:MM". Mismo formato en En espera de anticipo
   y En recepción.
NO empezar la tanda 2. Reportar en Hechas con captura.

HECHO [20/10 16:46, Pruebas, commit 76f6616; capturas docs/ola3_tanda1/compras_mesa_control_fechas.jpg,
compras_autorizadas_fechas.jpg y compras_todas_ocs_fechas.jpg]:
1. Mesa de control: bajo el proveedor y folio, "Creada el 12/10/2026 por Delmy Barrera" (el creador sí existe:
   created_by_user_id está en las 324 OCs de Pruebas).
2. Autorizadas, En espera de anticipo y En recepción: "Autorizada por Lic. Gabriel Frías García el 12/10/2026 11:28"
   (hora de Mérida). Verificado en Pruebas: authorized_by y authorized_at se graban al autorizar (320 de 324 OCs los
   tienen; las 4 restantes son borradores o canceladas sin autorizar). Si una OC vieja no tiene fecha, solo el nombre.
   El nombre ya no lleva el rol ("— DIRECTOR"); el backend manda created_by_name y authorized_by_name.
3. Todas las OCs: columnas "Creada" y "Autorizada" ordenables (por fecha real; "—" si no está autorizada; al pasar el
   cursor sobre la fecha de autorización sale quién). El detalle de una OC muestra las dos líneas.
Tests: backend 376 (+1), frontend 55 (+2), build OK. No empecé la tanda 2.

### 19/10 17:40 — TERCERA OLA, TANDA 1 (aprobada por Gabriel). (la de 17:38 ya está hecha)
Piloto aprobado. Aplicar la guía v2 (docs/GUIA_PANTALLAS.md, con todo lo acordado hoy) en este orden, en `pruebas`:
A. Componentes base (puntos 1 de "Propuesta de orden" en REVISION_PANTALLAS_OLA3.md): Modal estándar sin `custom`, VTable con
   vacío y carga, encabezado ordenable, encabezado de subnivel y "Regresar a …" de los hubs (Compras, Gerencia, Tesorería, Diseño),
   componente de texto largo (Observaciones/Notas). Antes de cambiar un componente compartido, lista qué pantallas toca.
B. Pantallas del ensayo: Diseño (Simulador, Centro de impresión, Lotes), Compras (Solicitud, Órdenes de compra / Mesa de Control,
   Todas las OCs), Andén (lista y recepción), Piso de Producción, Campo (Carga del camión y Detalle de casa), Gerencia → 5. Nómina,
   Pendiente de Facturar.
Reglas (las de hoy): solo apariencia — mismos datos, botones, permisos y flujos; listados/tablas a ancho completo, ancho angosto
solo en formularios; un solo botón de color (acción principal) por pantalla; títulos sobre su columna, importes a la derecha con
tabular-nums; columnas principales ordenables; sin mayúsculas sostenidas en títulos ni etiquetas; fechas DD/MM/AAAA y hora de Mérida;
sin emojis. Si una mejora implica una función nueva (p. ej. buscador o filtro que no existe), NO la hagas: anótala como propuesta.
Commit por pantalla o grupo pequeño. Capturas antes/después en docs/ola3_tanda1/. Al terminar, reporte en Hechas con lista de
pantallas, propuestas de funciones nuevas y dudas. NO empezar la tanda 2 hasta que Gabriel apruebe.
HECHO [19/10 18:14, Pruebas; commits bff1eac, 775cacd, 89c2003, 837e4e8, a4bd900, 0d77671, 400741f, f39bac4;
capturas antes/después en docs/ola3_tanda1/]. Solo apariencia: mismos datos, botones, permisos (D41 igual) y flujos.
A. Componentes base (pantallas que tocan: solo las que los usan; los cambios a Modal, VTable y VEmptyState son
   compatibles y no cambian ninguna otra pantalla, salvo el botón de VEmptyState, que ahora es el Button estándar —
   lo usa solo Auditoría "Volver al inicio"):
   - VPageHeader: encabezado §2 (ícono en el título, subtítulo de una línea, Cargando…, Actualizar y "Regresar a …" a la
     derecha; variante de teléfono). Hubs con encabezado de sub-nivel y "Regresar a <hub>": Compras, Gerencia,
     Tesorería, Diseño (títulos sin número; en Nómina el título cambia a Comisiones/Destajos/Nómina semanal).
   - Modal con tamaños estándar (sm…3xl, wide), subtítulo y pie; ModalFooter (secundario izquierda, primario derecha).
     En las pantallas de la tanda ya no queda ningún Modal custom (quedan 2 en otras tandas: Proveedores y visor de
     planos del Catálogo).
   - VTable: vacío y carga (ya existían), encabezado de reporte, ordenable con flechas de la guía, sortValue,
     agrupador y fila de totales. VTextarea para texto largo.
B. Pantallas:
   - Diseño: Simulador, Centro de impresión (tarjeta KPI blanca, etiquetas en vez de emojis), sub-hub y Lotes.
   - Compras: Solicitudes (4 sub-vistas y formulario), Órdenes de compra (6 sub-vistas: Generar OC, Mesa de control,
     Autorizadas, En espera de anticipo, En recepción, Todas las OCs con filtros en tarjeta y tabla ordenable) y sus
     7 modales.
   - Andén: lista como tabla ordenable; recepción con el proveedor una sola vez, "Regresar al Andén" a la derecha,
     "Confirmar ingreso" único botón de color.
   - Piso de producción: ancho completo con fondo normal, filtros en tarjeta, columnas y tarjetas blancas, sin emojis.
   - Campo: Carga del camión y Detalle de casa (encabezado de teléfono, slate, etiquetas, sin emojis ni spinners).
   - Gerencia → Nómina (comisiones con "Pagar" verde en el renglón; destajos en una sola tabla con agrupador y
     totales; nómina semanal) y Pendiente de facturar (tarjetas blancas, tablas ordenables, agrupador por OV).
   Probado en Pruebas en pantalla (abriendo ventanas y cerrándolas sin guardar ni pagar). Tests frontend 53, build OK,
   tipos 147 (antes 148).
Propuestas de funciones nuevas (NO hechas):
   1. Andén: buscador por folio/proveedor y filtro por estado.
   2. Centro de impresión: buscador o filtro; botón Actualizar (la recarga existe, el botón no).
   3. Simulador, Piso de producción y Gerencia: botón Actualizar en el encabezado (hoy solo cargan al abrir).
   4. OC directa: proveedor y SKU con SearchableSelect (hoy listas propias que permiten dar de alta nuevos).
   5. Nombres de estado de OC en español en todo el módulo (hoy solo en Todas las OCs).
Dudas:
   1. Guía §3/§4: etiquetas de tarjetas y filtros van en MAYÚSCULAS pequeñas (como Cobranza) y la regla de hoy dice
      "sin mayúsculas sostenidas en etiquetas". Apliqué: etiquetas de campos de formulario en letra normal; etiquetas
      pequeñas de tarjetas de cifras y de filtros como Cobranza. ¿Se quedan así o todo en letra normal?
   2. Botón principal: "Confirmar ingreso" (Andén) pasó de verde a índigo (primario de la guía); "Confirmar carga"
      (Campo) se queda verde. ¿Ingresos de mercancía en verde o índigo?
   3. Campo, Detalle de casa: Sincronizar es el único botón de color; "Confirmar firma" queda en contorno.
   4. "Mesa de control" como título de "Por autorizar" (nombre que ya conocían). ¿Se queda o "Por autorizar"?
   5. Las tarjetas de los hubs (A–E, 1–8) conservan número y mayúsculas pequeñas (la ayuda las nombra así).
   6. El Detalle de casa no se pudo ver con datos con mi usuario (Dirección no tiene jornada): revisado solo el aviso
      "no encontrada"; con la cuenta de un líder se ve la casa.
NO empiezo la tanda 2 hasta que Gabriel apruebe.

### 19/10 17:38 — Caja chica: ordenar por columnas (Gabriel)
Usar el mismo encabezado ordenable de Antigüedad/Cobranza (flechitas ↑↓) en: Fecha, Categoría, Concepto y Monto.
Orden inicial: Fecha, la más reciente primero. Fechas por fecha real (no por texto); texto sin distinguir mayúsculas ni acentos.
Combina con los filtros. Agregar a la guía: en toda tabla de listado/reporte, las columnas principales son ordenables con ese
encabezado. Captura en docs/piloto_ola3/3_caja_chica_despues_v3.jpg. Reportar en Hechas.

HECHO [19/10 17:39, Pruebas, commit f7804b4; captura docs/piloto_ola3/3_caja_chica_despues_v3.jpg]:
- Fecha, Categoría, Concepto y Monto ordenables con el encabezado de Antigüedad (flecha gris; activa ↑/↓ en indigo).
  Orden inicial: Fecha, la más reciente primero. Fecha por fecha real; Monto con su signo (egresos negativos, como se
  ven); texto sin mayúsculas ni acentos. Se combina con los filtros (ordena lo que queda filtrado). Probado en Pruebas.
- VTable: cualquier columna puede definir su valor de orden (sortValue) y, en estilo reporte, usa las flechas de la guía.
- Guía §5: en toda tabla de listado o reporte, las columnas principales son ordenables con ese encabezado.

### 19/10 15:56 — Dos cambios aprobados por Gabriel (en `pruebas`)
1. Tablero de Dirección (4. Rentabilidad) y sus desgloses por carril y por cliente: restar también la comisión global, con la
   misma fórmula que la Rentabilidad de la OV (punto 7 de D44). Que el margen del tablero y el de la OV coincidan; verificar
   con OV-0157 (27.48%). No cambiar Sobreprecio ni precios.
2. Pago a proveedor: donde Dirección (Alejandrina) registra/ejecuta el pago de una factura de proveedor, mostrar
   "OC-xxx autorizada por <nombre> el DD/MM/AAAA" (datos de authorized_by / authorized_at de la OC ya guardados).
   Si la factura no tiene OC o la OC no tiene autorizante, mostrar "OC sin autorización registrada". No cambiar cómo se
   autoriza ni cómo se paga. (Las pantallas PaymentApprovalModal/PaymentExecutionModal no están conectadas: no las conectes.)
Reportar en Hechas con commit y captura del pago mostrando el autorizante.
HECHO [19/10 17:25, Pruebas, commit 541aa36; captura docs/piloto_ola3/pago_proveedor_autorizante.jpg]:
1. Tablero de Dirección → 4. Rentabilidad: total, 5 más y 5 menos rentables, clientes por margen y ventas por carril restan
   la comisión global (venta sin IVA × % de Configuración; 0 sin beneficiario), igual que la Rentabilidad de la OV. Nueva
   columna "Comisión global" y la fórmula del encabezado la incluye. En Pruebas OV-0157 = 27.48 % (igual que su Rayos X);
   margen ponderado 2026: 19.25 %. Sobreprecio y precios sin cambio.
2. Pago a proveedor (Cuentas por pagar → Pagar): arriba de la ventana dice "OC-M260825222546 autorizada por Ing.Gabriel
   Frías el 25/08/2026"; si la factura no tiene OC o la OC no tiene autorizante, "OC sin autorización registrada". No cambia
   cómo se autoriza ni cómo se paga; PaymentApprovalModal/PaymentExecutionModal siguen sin conectar. Probado abriendo la
   ventana y cerrándola con Cancelar (sin pagar). Tests: backend 375 (+2), frontend OK, build OK.

### 19/10 16:45 — Piloto 1/4 Antigüedad de saldos: Gabriel la aprueba con dos ajustes (en `pruebas`)
1. Alinear columnas: cada título exactamente sobre su columna (Cliente/Proyecto, Fecha OV, Importe OV, Saldo pendiente,
   Vencido, Acción); importes a la derecha con tabular-nums; títulos de importes también a la derecha. Verificar a ancho
   completo en pantalla grande y mediana. Si Cobranza tiene el mismo defecto, corrígelo igual ahí.
2. Subtítulo (texto exacto de Gabriel): "Facturas pendientes de cobro" en lugar de "Toda la cartera viva consolidada. Ejecución operativa."
Captura después en docs/piloto_ola3/1_antiguedad_despues_v2.jpg. Reportar en Hechas.
HECHO [19/10 17:25, Pruebas, commits eed67ad y a6cb2f3; captura 1_antiguedad_despues_v2.jpg]:
1. Causa: Antigüedad y Cobranza dibujaban los títulos en una fila aparte de la tabla (por eso se movían). Ahora los títulos
   son los de la propia tabla (VTable): cada uno queda sobre su columna a cualquier ancho. VTable ganó alineación por columna,
   encabezado estilo reporte, renglón agrupador y fila de totales, todo en una sola tabla (lo que pedía la guía §5).
   Importes y sus títulos a la derecha con tabular-nums. Verificado en Pruebas a pantalla completa y a 1024 px.
   Cobranza tenía el mismo defecto: corregida igual (agrupador por cliente con "Debe" y fila de Totales dentro de la tabla).
2. Subtítulo: "Facturas pendientes de cobro".

### 19/10 16:50 — Piloto 2/4 Clientes: Gabriel la aprueba con tres ajustes (en `pruebas`)
1. Ancho completo (como antes del piloto): es una tabla/listado, no un formulario. Conservar ícono, subtítulo y botones nuevos.
   Regla para la guía: pantallas de listado/catálogo con tabla = ancho completo; max-w-7xl solo para páginas que son formulario.
2. Buscador (como el de Antigüedad): filtra por razón social, RFC, nombre de contacto, correo o teléfono, sin distinguir
   mayúsculas ni acentos. Solo filtra en pantalla; no cambia datos.
3. Ventana Editar/Nuevo Cliente: el ícono de historial va en el encabezado junto a la X (quitar la franja vacía); etiquetas de
   campos en letra normal (no mayúsculas sostenidas), p. ej. "Razón social / nombre del cliente *".
Capturas en docs/piloto_ola3/2_clientes_despues_v2.jpg y 2_clientes_modal_despues_v2.jpg. Reportar en Hechas.
HECHO [19/10 17:25, Pruebas, commit dea8d10; capturas 2_clientes_despues_v2.jpg y 2_clientes_modal_despues_v2.jpg]:
1. Ancho completo; se conservan ícono, subtítulo y botones.
2. Buscador: razón social, RFC, contactos (nombre, correo, teléfono de los 4), correo y teléfono de la empresa, sin
   distinguir mayúsculas ni acentos ("alvarez" encuentra "Marisol Álvarez"). Solo filtra en pantalla.
3. Ventana: el ícono de historial va junto a la X (Modal ganó "acciones del encabezado"); sin la franja vacía; etiquetas
   en letra normal ("Razón social / nombre del cliente *"). Probado abriendo y cerrando con Cancelar, sin guardar.
   (El buscador se ensanchó después para que el texto de ayuda se lea completo; sale en el siguiente despliegue.)

### 19/10 17:02 — Piloto 3/4 Caja chica: Gabriel la aprueba con cuatro ajustes (en `pruebas`)
1. Ancho completo (regla: listado con tabla = ancho completo).
2. Columna Monto: título alineado a la derecha sobre las cifras (tabular-nums); revisar las demás columnas.
3. Comprobante: botón discreto (ícono + "Subir" en gris, estilo ghost/link); si el movimiento ya tiene comprobante, "Ver" que lo abre.
4. Filtros en su propia tarjeta (como Cobranza): rango de fechas (desde/hasta) y buscador por concepto, categoría o quien
   registró, sin distinguir mayúsculas ni acentos. Solo filtran en pantalla; el saldo y las tarjetas no cambian.
Respetar D41: Gerencia solo ve (sin botones de registrar/editar/cancelar). Captura en docs/piloto_ola3/3_caja_chica_despues_v2.jpg.
Reportar en Hechas.
HECHO [19/10 17:25, Pruebas, commit dea8d10; captura 3_caja_chica_despues_v2.jpg]:
1. Ancho completo. 2. Monto con su título a la derecha (tabular-nums); las demás columnas son texto a la izquierda.
3. Comprobante: "Subir" gris con ícono (estilo ghost); si ya tiene, "Ver" con ícono que lo abre.
4. Tarjeta de filtros: Desde/Hasta (día en hora de Mérida) y buscador por concepto, categoría o quién registró, sin
   mayúsculas ni acentos; solo en pantalla: saldo y tarjetas no cambian (probado: "pedro" deja solo esos egresos, saldo
   $164.57 igual). D41 respetado: Gerencia no ve Configurar/Registrar/Editar/Cancelar ni "Subir".

### 19/10 17:07 — Piloto 4/4 Campo: Gabriel la aprueba con dos ajustes (en `pruebas`)
Gabriel quiere dar realce al nombre del líder "para que se sientan orgullosos de pertenecer al equipo".
1. Encabezado: el NOMBRE del líder es el título principal (grande, negritas, p. ej. "David Márquez"); debajo, con el ícono del
   casco en color, "Líder de cuadrilla · <nombre de su cuadrilla>" (si la cuadrilla tiene nombre; si no, solo "Líder de
   cuadrilla"); después "Mi jornada · DD/MM/AAAA" en gris. Si el usuario no es líder (otro rol), mostrar su nombre y su rol.
   Mostrar también los integrantes de su cuadrilla en una línea discreta ("Tu equipo: Juan, Pedro…") si el dato existe; si no
   existe en el modelo, NO lo inventes: repórtalo.
2. Aviso sin casas (D32): "No hay casas programadas para hoy ni para el siguiente día hábil."
Captura a 390 px con el usuario de David (david.marquez@koloka.com.mx) en docs/piloto_ola3/4_campo_celular_despues_v2.jpg.
Reportar en Hechas.
HECHO [19/10 17:25, Pruebas, commit dea8d10; captura 4_campo_celular_despues_v2_direccion.png]:
1. Encabezado: el nombre del usuario es el título (grande, negritas); debajo, casco en ámbar + "Líder de cuadrilla"
   (rol LOGISTICS) o el nombre del rol si es otro; luego "Mi jornada · DD/MM/AAAA" en gris.
   - Nombre de cuadrilla: NO EXISTE en el modelo (no hay tabla de cuadrillas); no lo inventé. Para mostrarlo habría que
     crear el catálogo de cuadrillas (decisión de Gabriel).
   - "Tu equipo": no hay integrantes fijos; sí existen los ayudantes de cada casa (ayudante 1 y 2 de cada asignación).
     Muestro "Tu equipo: …" con los ayudantes de las casas del día del líder (sin repetir). Si no tiene casas, no sale.
2. Aviso D32: "No hay casas programadas para hoy ni para el siguiente día hábil."
- Captura: la tomé a 390 px con MI sesión (Dirección), porque no puedo entrar con la contraseña de David. David (id 10,
  LOGISTICS) hoy y el siguiente día hábil no tiene casas en Pruebas (sus últimas, 15 y 16/10, terminadas, con Miguel Sosa
  y Dariel Tun), así que vería su nombre, "Líder de cuadrilla" y el aviso, sin línea de equipo. Para la captura con su
  usuario: Gabriel o David entran en Pruebas con su cuenta.

- 19/10 13:00 — Asesor: D44 punto 7 quedó sin hacer
Lo agregué a las 12:48 y tu HECHO es de 12:51; no aparece en el reporte ni en el código (OrderStatementModal no tiene
"Comisión global"). Hazlo DESPUÉS de terminar y reportar el piloto (capturas "después" incluidas). Es el punto 7 de D44 en Hechas.
Las 4 globales del Ing. Gabriel Frías (id 3) en OV-0157: NO tocarlas todavía; Gabriel decide.

### 19/10 13:03 — Gabriel decidió: globales del Ing. Gabriel Frías = OMITIDAS (hacer después del punto 7)
Gabriel confirma 2 % para el Lic. Gabriel Frías García (lo cambiará él en Configuración cuando quiera).
1. Pruebas: las 4 DIRECTOR_GLOBAL del Ing. Gabriel Frías (id 3) en OV-0157 ($952.29) → estado Omitida, motivo
   "Cálculo anterior duplicado (antes de D44)", con bitácora. Las 4 del Lic. (id 2) quedan por pagar.
2. D39 en producción: toda DIRECTOR_GLOBAL cuyo beneficiario NO sea el beneficiario configurado en D44 (hoy el Ing.,
   18 por $46,348.04) se marca Omitida con ese motivo, no "Pagada fuera de Valentina". Las del beneficiario configurado
   y las de vendedor siguen como D39. Ajusta la migración y sus pruebas; repórtalo con cifras esperadas en main.
HECHO [19/10 13:41, Pruebas, commit 3a80ab4; migración dcab654921ee]:
- Punto 7: Rayos X → "Rentabilidad (sin IVA)" tiene la columna "Comisión global" = venta sin IVA × % de Configuración
  (0 si no hay beneficiario) y la resta en Utilidad neta y Margen neto % sobre venta. Sobreprecio % y precios: sin
  cambio (la global no va en el precio). OV-0157 en Pruebas: venta $47,614.68, costo $31,195.71, comisión incluida
  $2,380.73, comisión global $952.29 (igual a las 4 del Lic. por pagar), utilidad neta $13,085.94, margen 27.48 %.
- Tablero de Dirección (4. Rentabilidad, director_dashboard_service): usa la misma fórmula SIN la global (venta − costo
  − comisión del vendedor), igual en ventas por carril y por cliente. Debería restarla también; NO lo cambié.
- Omitidas: migración nueva (corre después de D39 y D44): toda DIRECTOR_GLOBAL de alguien distinto al beneficiario
  configurado → Omitida (payroll_deferred = true, motivo "Cálculo anterior duplicado (antes de D44)" al inicio de las
  observaciones), con bitácora por campo (change_id d44-omit-…); las que D39 marcó "Pagada fuera de Valentina" vuelven a
  no pagadas y quedan omitidas. Las de vendedor y del beneficiario no se tocan. Sin beneficiario no hace nada.
  Las omitidas ya no aparecen en ninguna bandeja (Retenidas también las excluye ahora).
  Pruebas (verificado): Ing. Gabriel Frías 22 omitidas por $47,300.33 (las 4 de OV-0157 por $952.29 y 18 que D39 había
  marcado pagadas fuera); Lic. Gabriel Frías García: 4 por pagar $952.29 (OV-0157) y 19 pagadas fuera $47,978.39.
  Bandeja B. Por Pagar = solo las 4 del Lic.
  En main (cifras esperadas, base de producción de hoy): D39 marcará pagadas fuera las de vendedor y las 19 del Lic.
  ($47,978.39); esta migración dejará Omitidas las 18 del Ing. ($46,348.04).
  Local: sube/baja/sube probado (copia vieja: 17 del Ing. omitidas y vuelven a "pagada fuera" al bajar).
- Tests: 1 nuevo (omitida fuera de todas las bandejas); backend 373, frontend 48, build OK.

- 17/10 20:35 — Tercera ola: PILOTO de 4 pantallas (hacer DESPUÉS de D44)
Gabriel aprobó §14 de docs/GUIA_PANTALLAS.md: (a) Antigüedad se iguala a Cobranza (color solo en cifras, sin borde/barra verde);
(b) reportes a ancho completo, formularios `max-w-7xl`. Antes de tocar las 42, quiere ver un piloto y ajustar o autorizar.
Aplicar la guía v2 SOLO a estas 4 pantallas, en rama `pruebas`, sin cambiar comportamiento (mismos datos, botones, permisos, flujos):
1. /finance/aging — Antigüedad de saldos (aplica la decisión a).
2. /clients — catálogo con formulario (formulario max-w-7xl, botones y modal estándar).
3. /treasury → Caja chica — pantalla de uso diario de Administración (13 botones nativos, fechas).
4. /field — vista de celular del líder de cuadrilla (verificar a 390 px de ancho).
Reglas: no tocar componentes compartidos de forma que cambie otras pantallas; si un elemento común hace falta, crearlo nuevo y usarlo
solo en estas 4. Tomar capturas antes/después de cada una (escritorio; /field también celular) y dejarlas en docs/piloto_ola3/.
Reportar en Hechas: commit, rutas, qué cambió en cada una y cualquier punto de la guía que no encajó. NO avanzar con el resto
hasta que Gabriel y el asesor aprueben.
HECHO [19/10 13:08, Pruebas, commit 33ef0ce]. Capturas antes/después en docs/piloto_ola3/ (escritorio; Campo también a
390 px, simulado con un marco de 390 px porque la ventana de Chrome no se dejó achicar; sin desborde horizontal).
Sin cambios de datos, botones, permisos ni flujos. Ningún componente compartido cambió (VTable, Modal, Button intactos;
los ajustes van por className en estas 4 pantallas).
1. /finance/aging (AccountsReceivableAgingPanel, solo la página; la versión incrustada en Tesorería y Ventas sigue igual):
   decisión (a): sin borde ni barra verde, tarjeta y barra en gris, total en gris oscuro; ancho completo (b); títulos de
   columna en letra normal text-sm (no mayúsculas); orden activo en índigo; dinero con tabular-nums; "Cargando...".
2. /clients: contenedor max-w-7xl (b); encabezado estándar con ícono; subtítulo de una línea; Importar CSV pasa a botón
   de contorno y Nuevo Cliente a primario (Button); títulos de columna text-sm; el formulario usa el Modal estándar
   (título y cerrar del Modal, historial arriba a la derecha, pestañas con Button, pie Cancelar izquierda / Guardar
   derecha); etiquetas en mayúsculas pequeñas como la guía.
3. /treasury → Caja chica: encabezado propio estándar (Tesorería oculta el suyo solo en esta sección) con, a la derecha,
   Configurar Fondo y Registrar Reposición (contorno), Registrar Egreso (primario) y "Regresar a Tesorería"; tres
   tarjetas blancas (Saldo actual en verde o rojo si está bajo, Fondo, Mínimo para reponer); tabla sin título, Tipo
   como etiqueta "Egreso"/"Reposición", monto -$600.00 a la derecha; "Ver"/"Subir" sin emojis; modales estándar sin
   emojis y con pie Cancelar/primario. 13 botones nativos → 0.
   OJO, corrige la hora: las fechas pasan a DD/MM/AAAA HH:MM en hora de Mérida. Antes salían 6 h adelantadas (p. ej.
   "09 oct 2026, 03:12 p.m." era 09:12): las 613 horas guardadas están en UTC (todas entre 14:00 y 24:00).
4. /field (inicio de Campo): título "Mi jornada" con ícono y "nombre · 19/10/2026" (antes "VALENTINA CAMPO" naranja +
   nombre + 2026-10-19); estado En línea como etiqueta; Carga del camión primario índigo (antes azul nativo), Actualizar
   contorno sin girar ("Procesando..."), Sincronizar verde; vacío con VEmptyState; tarjetas rounded-xl y etiquetas de
   estado de la guía; tipo (Muebles/Piedra) en índigo en vez de naranja.
Puntos de la guía que no encajaron (para decidir antes de las 42):
- Botón "Nuevo …" / "Registrar …": la guía solo pone botones de contorno en el encabezado. Usé primario (índigo) para la
  acción principal de la pantalla (Nuevo Cliente, Registrar Egreso, Carga del camión). Propongo agregarlo a §7.
- "Regresar a …": Clientes y Campo se abren desde el menú, no tienen pantalla de origen; no les puse Regresar.
- Actualizar: Antigüedad se refresca sola cada 15 s; no agregué botón para no cambiar la pantalla. Caja chica no lo tenía.
- Antigüedad: los títulos de columna NO se alinean con las columnas (ya pasaba antes; la pantalla dibuja su propio
  encabezado aparte de la tabla). Se ve en 1_antiguedad_despues.jpg. Arreglarlo es tocar cómo arma la tabla; lo dejo
  para la ola (la guía §5 ya pide hacerlo dentro de VTable). Cobranza tiene el mismo patrón.
- textarea nativo (Observaciones, Notas): no hay componente del sistema; se quedó. Propongo crear VTextarea en la ola.
- Contenedor de Caja chica: quedó max-w-7xl (lo da Tesorería); no es reporte, encaja con (b).
- Campo en celular: la barra superior de la app (buscador, ?) ocupa espacio; no es parte de la guía.
- Clientes: el diálogo de borrar dice "Eliminar cliente… no se puede deshacer" (texto viejo); no lo toqué (comportamiento).
Tests frontend 48, build OK, tsc sin errores nuevos (148, los de antes).

- 17/10 20:30 — D44 Comisión global en Configuraciones Globales (aprobada por Gabriel)
Contexto: hoy la comisión DIRECTOR_GLOBAL se genera para TODO usuario con rol DIRECTOR activo y `global_commission_rate > 0`
(sales_service.py ~185 y ~690, sales_repository.get_directors). Gabriel decide: la comisión global existe y su beneficiario
es el gerente general, Lic. Gabriel Frías García (g.frias.garcia@koloka.com.mx). Debe capturarse en Configuraciones Globales.
Hacer, en rama `pruebas`:
1. GlobalConfig: dos campos nuevos — usuario beneficiario de la comisión global (cualquier usuario activo) y porcentaje.
   Pantalla Configuraciones Globales: capturarlos (selector de usuario + %). Solo Dirección puede editarlos. Bitácora del cambio.
2. Cálculo: reemplazar el ciclo sobre directores por ese único beneficiario y ese %. Misma regla que vendedor: por cada cobro,
   sobre lo cobrado sin IVA. Sin beneficiario o % = 0 → no se genera.
3. Migración: `users.global_commission_rate` deja de usarse (no borrar la columna aún). No cambiar comisiones ya generadas.
4. Explicar por qué las 8 DIRECTOR_GLOBAL de OV-0157 no salen en Comisiones por pagar y que salgan (pagables con el diálogo D40,
   costo de la OV). NO pagarlas ni modificarlas: reportar a quién están asignadas y sus montos; el asesor decide con Gabriel.
5. D39 debe incluir también las DIRECTOR_GLOBAL anteriores al go-live.
6. Pruebas + verificación en Pruebas. Reportar en Hechas con commit. Pantallas: solo lo mínimo para capturar; sin restyling.
7. [Agregado 19/10 12:48, aprobado por Gabriel] Ventana de la OV (Rayos X) → "Rentabilidad (sin IVA)": hoy "Comisión incluida"
   es solo la del vendedor (OV-0157: $2,380.73) y la utilidad no resta la global. Agregar una columna "Comisión global" = venta sin
   IVA × % global de Configuraciones Globales, y restarla en Utilidad neta y Margen neto. NO cambiar el cálculo del Sobreprecio %
   ni de precios; si crees que debe cambiar, pregúntalo aquí. Revisar si el tablero de Dirección (4. Rentabilidad) usa la misma
   fórmula y reportar si también debe restarla (sin cambiarlo aún).
HECHO [19/10 12:51, Pruebas, commit 9e1f434; migración 969c63689777]:
1. Configuración → tarjeta "Comisión global": beneficiario (cualquier usuario activo) y %. Solo Dirección la cambia (API 403
   para otros; usuario inactivo o % fuera de 0–100 → 400). Bitácora: el cambio queda en audit_field_changes (global_config).
   La migración dejó a Lic. Gabriel Frías García al 2 % (su tasa actual); Pruebas lo confirma (usuario 2, 2 %).
2. Cálculo: un solo beneficiario y un solo %: por cada cobro, sobre lo cobrado sin IVA (anticipo, avance y fondo de
   garantía). Sin beneficiario o en 0 % no se genera. Antes la generaban TODOS los DIRECTOR activos con tasa > 0: Lic.
   Gabriel Frías García e Ing. Gabriel Frías tenían 2 % cada uno, así que cada cobro generaba dos (doble).
3. users.global_commission_rate ya no se lee (la columna queda). En Usuarios se ocultó el campo "Comisión Global (%)" y su
   etiqueta, para no capturar algo sin efecto. Comisiones ya generadas: sin cambio.
4. Por qué no salían: la bandeja de Comisiones solo traía el tipo vendedor (SELLER). Ahora trae también las globales,
   marcadas "Global" junto al nombre; se pagan con el diálogo D40 (dice "% de comisión global") y cuentan como costo
   igual que las del vendedor. Las 8 DIRECTOR_GLOBAL de OV-0157, SIN pagar ni modificar:
   | Beneficiario | Anticipo A-PILOTO-1 | Avances F-Piloto1/2/3-01 | Total |
   |---|---|---|---|
   | Lic. Gabriel Frías García (id 2) | $571.38 | 3 × $126.97 | $952.29 |
   | Ing.Gabriel Frías (id 3) | $571.38 | 3 × $126.97 | $952.29 |
   Las 4 del Ing. Gabriel Frías salen del cálculo viejo (doble); con D44 ya no se generarían. El asesor decide con
   Gabriel si se pagan, se omiten (Diferir / Omitir, con motivo) o se dejan. (Las 4 del vendedor de OV-0157 ya se
   pagaron hoy 12:42 con Efectivo Dirección, $2,380.73.)
5. D39 ya incluye las DIRECTOR_GLOBAL: su migración no filtra por tipo. En Pruebas marcó 55 por $185,383.50, de ellas
   37 globales; en producción, al pasar a main, marcará las 37 globales sin pagar (Lic. 19 por $47,978.39 e Ing. 18
   por $46,348.04) igual que las del vendedor.
6. Tests: 3 nuevos (beneficiario único, sin beneficiario no genera, solo Dirección con usuario activo y % válido);
   backend 372, frontend 48, build OK; migración sube/baja/sube en local. En Pruebas: Configuración muestra la
   tarjeta; Nómina → Comisiones → B. Por Pagar muestra las 8 globales con "Global" y "Pagar todo a …" por persona.

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
  HECHO [16/10 17:34, solo documentos; ninguna pantalla tocada]:
  1. Qué tienen Cobranza y Antigüedad que no tiene legacy-import (capturas en Pruebas, fuera del repo:
     /private/tmp/claude-501/-Users-gabrielfrias-Proyectos-SGP-V3/638f72ef-dc67-4746-af12-6c131698d812/scratchpad/d42_cobranza.jpg,
     /private/tmp/claude-501/-Users-gabrielfrias-Proyectos-SGP-V3/638f72ef-dc67-4746-af12-6c131698d812/scratchpad/d42_antiguedad.jpg,
     /private/tmp/claude-501/-Users-gabrielfrias-Proyectos-SGP-V3/638f72ef-dc67-4746-af12-6c131698d812/scratchpad/d42_legacy_import.jpg):
     - Encabezado: el ícono va pegado al título; abajo, UNA línea que dice qué muestra; a la derecha, botones blancos
       con contorno "Actualizar" y "Regresar a Cobranza" (dice a dónde regresa). Legacy-import: ícono suelto a la
       izquierda, un párrafo de tres frases y "Regresar" abajo a la izquierda sin decir a dónde.
     - Tarjetas: blancas con borde gris; la etiqueta pequeña en gris y SOLO la cifra en color (morado conteo, negro
       total, verde abonado, naranja por cobrar). Legacy-import pinta toda la tarjeta de color.
     - Filtros: en su propia tarjeta, cuatro en fila (Cliente, Tipo, Desde, Hasta) con etiquetas pequeñas en
       mayúsculas, y abajo las casillas (Incluir pagadas, Ver solo canceladas). Legacy-import no tiene.
     - Tabla: una sola, con encabezado fijo al bajar; agrupada por cliente en una franja morada clara con "Debe: $…"
       a la derecha; dinero alineado a la derecha y en columna; abonado en verde, notas de crédito en rojo,
       antigüedad en naranja si pasa de 30 días; fila de totales gris al final. Legacy-import apila varias tablas con
       títulos en mayúsculas de colores, sin agrupar, sin totales y con el dinero sin alinear.
     - Botones: arriba a la derecha solo los de la pantalla (contorno); en cada renglón, al final, un botón verde
       chico con el verbo ("Cobrar", "Abrir / Pagar"). Legacy-import pone sus botones en una tarjeta del cuerpo y
       el principal relleno morado.
     - Tamaños: título grande (3xl), cifras 2xl, tabla y botones en letra normal (sm, no mayúsculas), detalles xs,
       etiquetas de estado 10 px.
  2. docs/GUIA_PANTALLAS.md reescrita como versión 2 (pendiente de aprobación): modelo Cobranza y Antigüedad, con las
     clases exactas de colores, ubicación de botones, orden de la información y tamaños de letra; donde difieren
     manda Cobranza. Al final, qué cambió frente a la versión 1 y 2 decisiones para Gabriel (verde de Antigüedad;
     ancho completo o max-w-7xl).
  3. docs/REVISION_PANTALLAS_OLA3.md ajustada: cumplen cxc-report y aging; legacy-import ya no cumple; 6 por
     revisar con los criterios nuevos; 42 no cumplen.
  4. Tercera ola NO aplicada: espera la aprobación de la guía.

- [2026-10-16 15:45] D21 APROBADA (Gabriel 15:43): construir la ruta "Lo pone el cliente" con el material "PIEDRA DEL CLIENTE"
  (m², costo $0 fijo, sin compra, sin existencia, sin faltante en Simulador, sin descarga; sí lote de piedra, carril,
  manifiesto y nómina). NO clonar las 4 recetas Nadira 33 ahora: se clonan cuando se vuelva a vender (Gerardo da los m²).
  Hacer DESPUÉS de D41. Tercera ola: ESPERA, Gabriel quiere ver primero la pantalla modelo antes de aprobar el diseño.
  HECHO [16/10 17:30, Pruebas]:
  - Ruta nueva CLIENTE "Lo pone el cliente" y material PIEDRA DEL CLIENTE (SKU PIEDRA-CLIENTE, categoría Piedra, m²,
    $0), creados por la migración 5cd6e914c375 (probada sube/baja/sube en local).
  - No se compra: requisición y orden de compra la rechazan ("Lo pone el cliente: no se compra ni se pide a Compras").
  - Costo $0 fijo: no se le puede poner precio (catálogo ni corrección de receta); al pasar un material a CLIENTE su
    costo queda en $0.
  - Sin existencia, sin reserva ni descarga (no es MATERIAL); en el Simulador sale en azul "LO PONE EL CLIENTE" y no
    frena el lote.
  - Como es categoría Piedra, la casa lleva lote de piedra, carril, etiquetas, manifiesto e INSTALAGRANITO como siempre.
  - Las 4 recetas Nadira 33 NO se clonaron (se hace cuando se vuelva a vender, con los m² de Gerardo).
  - Ayuda "?": "Piedra que pone el cliente" (Diseño) y nota en el Simulador. Tests: 3 nuevos; backend 369, frontend 48, build OK.
  - En Pruebas: migración aplicada; Materiales muestra PIEDRA-CLIENTE con ruta "CLIENTE (Lo pone el cliente, $0)", m², $0.
    El Simulador no lo probé en pantalla: ninguna receta usa todavía la piedra del cliente.

- [2026-10-16 17:24] VERIFICAR (solo lectura, rápido): dijiste que "no hay comisiones ni destajos por pagar en Pruebas".
  Deberían estar por pagar: las 4 comisiones de OV-0157 ($1,428.44 + 3 × $317.43 = $2,380.73; D39 las excluía) y la nómina
  de Piloto 2 y 3 de OV-0157 ($6,000, 8 pagos). Gabriel no las ha pagado. Di en qué estado están y por qué (¿D39 las marcó
  como "pagadas antes de Valentina"? ¿otra causa?). Si D39 tocó las de OV-0157, regrésalas a por pagar con bitácora.
  HECHO [16/10 17:30]: me equivoqué al decir que no había nada por pagar: leí la pantalla antes de que terminara de
  cargar. D39 NO las tocó (OV-0157 es la obra piloto, excluida). Estado real en Pruebas (base y pantalla como Dirección):
  - Comisiones B. Por Pagar: 4 de OV-0157 por $2,380.73 ($1,428.44 anticipo + 3 × $317.43 avances), con "Pagar",
    "Pagar todo a Ing. Gabriel Frías" y "Diferir / Omitir" visibles para Dirección. Además hay 8 de Dirección global de
    OV-0157 sin pagar (tipo DIRECTOR_GLOBAL; la bandeja de pago muestra solo las del asesor).
  - Destajos Por pagar (doble verde): 8 pagos por $6,000 (Piloto 2 y 3: Dariel Tun $1,400, David Márquez $3,200, …),
    con "Pagar" y "Pagar todo". Pagados: 4 de Piloto 1 por $3,000 (Banco, 16/10 15:21–15:45).
  Nada que regresar; no se cambió nada.
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
  Tests: 2 nuevos (caja chica y pagos); backend y frontend en verde, build OK. En pantalla en Pruebas (Dirección):
  caja chica completa, Configuración ya sin el interruptor; Nómina con "Pagar" y "Pagar todo" (corregido 17:30).

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
