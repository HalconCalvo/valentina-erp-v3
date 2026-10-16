<!--
AYUDA DE VALENTINA — textos del botón "?" (arriba a la derecha).

Cómo editar (no hace falta saber programar):
- Cada pantalla empieza con una línea "# /ruta" (la dirección de la pantalla, p. ej. /sales).
  La ayuda que se muestra es la de la ruta más parecida a la pantalla abierta.
- "## Título" es el nombre de la pantalla; "### Subtítulo" es una tarea.
- Párrafos normales, listas con "- " y pasos numerados con "1. ". **Negritas** con dos asteriscos.
- Español sencillo: qué es la pantalla, quién la usa y los pasos de las tareas comunes.
- Versión 2 (asesor, 16/10/2026), con lo aprendido en el ensayo de la obra piloto. Aprobada por Gabriel (D38).

Buscador "¿En qué te ayudo?" (D38):
- Debajo de cada "### tarea" puede ir una línea "Claves: palabra, otra palabra, frase" con las palabras con que la
  gente buscaría esa tarea (p. ej. "Claves: OC, orden de compra, compras"). Separa con comas.
- Para agregar una clave, escríbela en esa línea. No importan acentos ni mayúsculas ("Nómina" = "nomina").
- Una línea "Enlace: /ruta?..." debajo de una tarea hace que el botón "Ir" del buscador abra directo ese nivel
  (p. ej. "Enlace: /management?nomina=comisiones"). Tampoco se muestra.
- La línea "Claves:" no se muestra en la ayuda; solo sirve para buscar. El buscador también busca en el título
  de la tarea y en su texto.
- Cada quien solo ve resultados de las pantallas que su puesto puede abrir.
-->

# /sales
## Ventas
Aquí el vendedor ve sus cotizaciones, sus órdenes de venta (OV), lo que le deben sus clientes y sus comisiones.
Lo usan Ventas, Gerencia y Dirección. Cada vendedor solo ve lo suyo.

Las tarjetas de arriba son: **1. Mis Ingresos** (lo vendido en el mes contra tu meta y tu comisión),
**2. Cotizaciones**, **3. Cobranza**, **4. Monitor Operativo** y **5. Seguimiento** (cómo va cada casa de tus OVs).

### Hacer una cotización
Claves: cotizar, cotización, presupuesto, precio, nueva cotización
1. Entra a **2. Cotizaciones** y pulsa **Nueva Cotización**.
2. Escoge el cliente y agrega los productos (salen del catálogo de Diseño) con su cantidad.
3. Revisa cantidades, precios y total. Si algo no cuadra con lo que platicaste con el cliente, coméntalo con
   Dirección antes de enviar.
4. Pulsa **Solicitar autorización**. La cotización queda "En revisión" hasta que Dirección la autorice.

### Cuando Dirección autoriza
Claves: autorizar, autorización, PDF, enviar al cliente, cambios solicitados
- La cotización pasa a "Autorizada" y ya se le puede enviar al cliente (botón de PDF).
- Si Dirección pide cambios, vuelve a ti con el motivo: corrige y envía otra vez.

### Convertir en orden de venta (OV)
Claves: OV, orden de venta, generar OV, OC del cliente, anticipo
1. Cuando el cliente manda su orden de compra (OC), abre la cotización autorizada.
2. Pulsa **Generar OV** y captura el folio y la fecha de la OC del cliente.
3. La OV nace "Esperando anticipo". Cuando Administración registra el cobro del anticipo, pasa a vendida y la
   fábrica ya puede trabajarla.

### Bautizar las casas
Claves: bautizar, casa, calle, lote, nombre de la casa, identidad
El bautizo (calle y lote de cada casa) lo hace **solo Ventas**, en **4. Monitor Operativo → Bautizar / Agrupar
por casa** o en el detalle de la OV con **Gestionar Identidad / Bautizar**. La calle se queda escrita para la
siguiente casa; solo cambias el lote. Diseño, Producción y Campo ya ven cada casa con su nombre.

### Cambiar una OV ya vendida
Claves: orden de cambio, CAM, cambiar OV, agregar partida, cancelar partida
Todo cambio de dinero (agregar partidas, cambiar cantidades o precios, cancelar partidas) se hace con una
**orden de cambio**. Dirección la autoriza y después se aplica. Solo puede haber una abierta a la vez.

### Tu comisión
Claves: comisión, comisiones, mi comisión, porcentaje
Se gana **con cada cobro** (el anticipo y cada factura de avance): lo cobrado sin IVA × el % de comisión de esa OV.
Cada OV puede tener su propio porcentaje.

### Palabras que verás
Claves: saldo, falta cobrar, facturado sin cobrar, cuentas por cobrar
- **Falta cobrar del contrato**: lo que el cliente todavía debe de toda la OV.
- **Facturado sin cobrar**: lo que ya se le facturó y aún no paga.

# /quotations
## Cotización
Captura o detalle de una cotización. Ver la ayuda de **Ventas** para los pasos completos.

### Estados de una cotización
Claves: estado, borrador, en revisión, autorizada, perdida, vencida
- **Borrador**: la estás armando.
- **En revisión**: la tiene Dirección.
- **Cambios solicitados**: Dirección te la regresó con un motivo.
- **Autorizada**: lista para enviar al cliente y para generar la OV.
- **Convertida en OV**, **Perdida**, **Vencida** o **Cancelada**.

# /inventory
## Compras y Almacén
Aquí se pide material, se compra, se recibe y se controla lo que hay en el almacén.
Lo usan Compras y Almacén, Producción (para pedir), Administración, Gerencia y Dirección.

### Pedir material (1. Solicitud de Compra)
Claves: requisición, solicitud de compra, pedir material, material, faltante
1. Entra a **1. Solicitud de Compra** → **Nueva solicitud**.
2. Escoge el material, la cantidad (en la unidad que indica) y, si es para una obra, la **OV**.
3. Pulsa **Crear requisición**. Queda pendiente para Compras. Los materiales bajo su mínimo también aparecen solos.
   Si el Simulador detecta que falta MDF o piedra, puede generar la requisición por ti.

### Comprar (2. Generar Órdenes de Compra)
Claves: OC, orden de compra, compras, proveedor, proveedores, autorizar OC, enviar OC
1. **A. Generar OC**: las solicitudes salen agrupadas por proveedor. Elige la categoría de gasto y pulsa
   **Generar orden de compra**.
2. **B. Por autorizar** (Mesa de Control): Dirección o Gerencia revisa y pulsa **Autorizar** o **Rechazar**.
   - **Quitar partida** (flecha): saca el material de esa OC y la solicitud regresa a Compras.
   - **Cancelar partida** (⊗): el material ya no se necesita; pide motivo.
3. **C. Autorizadas**: pulsa **Enviar por correo** al proveedor, o **Marcar como enviado** si se la mandaste por otro
   medio. Hasta que la OC está enviada aparece en el Andén.

### Recibir mercancía (3. Recepción — Andén de Descarga)
Claves: recepción, recibir, andén, entrada, factura del proveedor, proveedores
1. Cuando llega el proveedor, abre **3. Recepción** y escoge la OC.
2. Captura la **fecha de llegada**, el **folio de la factura** del proveedor y lo que realmente llegó.
3. Pulsa **Confirmar ingreso**. Sube la existencia y se actualiza el costo del material.

### Inventario y conteo físico
Claves: inventario, existencia, conteo, conteo físico, kárdex, almacén, corte
- **4. Inventario**: cuánto dinero hay en almacén, por artículo.
- **Conteo físico**: el contador captura lo que cuenta **sin ver** lo que dice el sistema. Si la diferencia
  es grande, Gerencia o Dirección la aprueban. Al aprobar el corte, el mes queda cerrado.
- **8. Kárdex**: todos los movimientos de un material, con su referencia (OV, lote u OC).

### Bueno saber
Claves: material núcleo, negativo, descarga
- El **MDF y la piedra** (material núcleo) no pueden faltar para producir. Herrajes, tornillos y demás sí pueden
  quedar en negativo mientras llegan.
- El tablero y la piedra se descargan solos al **entrar a producción**; los herrajes, al **marcar herrajes surtidos**.

# /design
## Diseño e Ingeniería
Aquí se hacen las recetas: qué materiales y procesos lleva cada producto y cuánto cuesta. Con ellas Ventas
cotiza y Producción fabrica. Lo usan Diseño, Gerencia y Dirección.

### Buscar una receta
Claves: receta, buscar receta, número de receta, producto
- Escribe el nombre del producto, o su número con **#** (p. ej. **#197**).

### Crear un producto y su receta
Claves: receta, producto nuevo, versión, materiales, INSTALACOCINA, INSTALAGRANITO
1. Pulsa **Nuevo Producto**, escoge el cliente y la categoría y ponle nombre.
2. Se crea la versión V1.0 en borrador. Ábrela y agrega los materiales y procesos con su cantidad.
3. Agrega la línea de instalación en días: **INSTALACOCINA** para muebles e **INSTALAGRANITO** para piedra
   (de ahí sale la nómina de la cuadrilla).
4. Cuando esté completa, cambia su estado a **LISTO**: queda bloqueada y ya se puede cotizar.

### Cambiar una receta que ya se usó
Claves: clonar, versión nueva, cambiar receta, corregir receta
Si una versión ya está en una OV o en una cotización en revisión o autorizada, **no se puede cambiar**: se
clona y se corrige la versión nueva. Lo ya vendido conserva su receta.

### Otras pantallas de Diseño
Claves: simulador, centro de impresión, plano
- **Simulador**: arma los lotes de producción (MDF o piedra) con las casas pagadas.
- **Centro de impresión**: etiquetas de bultos y manifiestos de piedra.
- **Plano**: cada versión puede llevar su plano adjunto (clip).

# /design/simulator
## Simulador y Lotificación
Aquí Diseño arma los **lotes** que entran a fábrica y revisa si alcanza el material.

### Armar un lote
Claves: lote, simulador, simulación, lotificación, MDF, piedra, crear lote, requisición
1. Pulsa el botón **MDF** o **Piedra** de la OV.
2. Marca las casas que van en el lote (el contador de arriba dice cuántas llevas).
3. Pulsa **Ejecutar Simulación**: compara lo que pide la receta contra lo que hay en almacén.
4. **Verde**: hay MDF o piedra suficiente; pulsa **Crear lote**. Un lote puede llevar una o varias casas.
5. **Ámbar**: falta material núcleo. **No se puede crear el lote.** Si de verdad se necesita, pulsa
   **Generar requisición a Compras** (te pide confirmar la cantidad). Si solo estás probando, no generes nada.

### Bueno saber
Claves: faltante menor, simular
- Si cambias las casas marcadas, vuelve a simular antes de crear el lote.
- Herrajes y tornillos que falten salen como "faltante menor" y no detienen el lote.

# /design/print-center
## Centro de impresión
Aquí salen las **etiquetas de bultos** (muebles) y los **manifiestos de piedra** que Producción pidió en Empaque.

### Imprimir
Claves: etiquetas, imprimir, manifiesto, código, QR, bultos
1. Busca la casa en la bandeja. Una casa con muebles y piedra sale en **dos renglones**.
2. Pulsa **Descargar etiquetas** (MDF) o **Descargar manifiesto** (piedra) e imprímelo.
3. La columna **Impresión** dice "Pendiente de imprimir" o la fecha y quién lo imprimió.

### Bueno saber
Claves: código, QR, etiqueta
- Cada etiqueta trae la OV, la casa en grande, el número de bulto ("MDF 1/5") y un **código** corto. Si la cámara
  del instalador no lee el QR, puede teclear ese código en Campo.

# /design/versions
## Editor de receta
Aquí se capturan los materiales y procesos de una versión. Arriba ves el producto, la versión (V1.0, V2.0…) y
su número de receta (**#**).

### Pasos
Claves: receta, editor, materiales, costo
1. Agrega cada material o proceso con su cantidad en la unidad de uso.
2. Revisa el costo total abajo (se calcula solo).
3. Para cambiar el nombre de la versión usa el lápiz junto al nombre.

# /planning
## Planeación Maestra
Aquí se ponen las fechas de cada casa y se asignan las cuadrillas de instalación. Lo usan Planeación,
Gerencia y Dirección.

### Las cuatro fechas de una casa
Claves: fechas, PM, PP, IM, IP, calendario
- **PM** producción de muebles (MDF) · **PP** producción de piedra.
- **IM** instalación de muebles · **IP** instalación de piedra.

### Programar una casa
Claves: programar, fechas, cuadrilla, instaladores, calendario, asignar cuadrilla
1. Abre la casa en el calendario (o en el Panel de Salud de la derecha, buscando la OV).
2. Pon las fechas y, en cada instalación, la **cuadrilla** (líder y ayudantes).
3. Pulsa **Guardar**. Cambiar una fecha no le quita la cuadrilla.

### Reglas
Claves: cuadrilla, sin cuadrilla, franja roja, adelantar instalación
- No se puede instalar antes de producir. Si la fábrica ya produjo antes de lo planeado, sí puedes adelantar la
  instalación.
- La franja roja de arriba avisa las instalaciones a 3 días o menos **sin cuadrilla**: pulsa **Asignar**.
- Una palomita (✓) en la píldora indica que esa etapa ya se hizo.

# /production
## Piso de Producción
El tablero de la fábrica: **1. Lote por producir → 2. En producción → 3. En empaque → 4. Listo para instalarse**.
Lo usan Producción, Gerencia y Dirección. Usa **Todos / MDF / Piedra** y el buscador (OV, cliente o casa).

### Producir un lote
Claves: lote, producción, entrar a producción, empaque
1. Pasa el lote a **En producción**. En ese momento el sistema descarga del almacén el MDF o la piedra.
2. Cuando termine, pásalo a **En empaque**.

### Empacar una casa (muebles)
Claves: empaque, bultos, etiquetas, herrajes, surtir herrajes
1. Escribe los **bultos MDF** y los **bultos de herrajes**.
2. Pulsa **Solicitar etiquetas** (Diseño las imprime en el Centro de impresión).
3. Pulsa **Marcar herrajes surtidos**: se descargan del almacén los herrajes de la receta.

### Empacar una casa (piedra)
Claves: piedra, piezas, manifiesto, empaque
1. Escribe las **piezas de piedra** y pulsa **Declarar y solicitar manifiesto**.

### Listo para instalarse
Claves: listo para instalar, instalar, etiquetas
Arrastra la casa a **4. Listo para instalarse**. Si la casa lleva muebles y piedra, los dos lotes deben haber
entrado a producción. Imprime antes las etiquetas: el sistema te avisa si faltan.

# /field
## Campo (celular del instalador)
Lo usa el **líder de la cuadrilla** en la obra. En el inicio ve sus casas de **hoy** y las que ya cargó y faltan por
firmar; en **Carga del camión**, las cargas de **hoy y del siguiente día hábil**.
Funciona sin señal; al recuperarla, pulsa **Sincronizar**.

### Cargar el camión
Claves: carga, cargar camión, escanear, QR, código, bultos
1. Pulsa **Carga del camión** (dice cuántas cargas faltan) y abre la casa.
2. Pulsa **Escanear QR del bulto** y apunta a una etiqueta de esa casa (o al manifiesto, si es piedra).
   Si no lee, teclea el **código** que trae la etiqueta.
3. Revisa los bultos que debes cargar y pulsa **Confirmar carga**. Solo el líder puede confirmar.

### En la obra
Claves: fotos, trabajo terminado, firma, firmar, sincronizar, obra
1. Abre la casa y toma las **Fotos** de evidencia.
2. Pestaña **Trabajo terminado**: márcalo en cada instalación (muebles y piedra).
3. Pestaña **Firma**: el cliente firma **una sola vez, al final de toda la casa** (después de la piedra, si lleva).
4. Pulsa **Sincronizar** y espera el aviso **Sincronizado ✓**.

### Bueno saber
Claves: firma, factura de avance, pago de cuadrillas
- Con la firma del cliente se liberan la factura de avance de esa casa y el pago de las cuadrillas.

# /treasury
## Administración (Tesorería)
Aquí se ven las tareas de dinero del día: lo que hay que facturar, cobrar y pagar.
Lo usan Administración, Gerencia y Dirección. Administración prepara los pagos; ejecutarlos es de Dirección.

### Cobrar un depósito del cliente
Claves: cobrar, cobro, depósito, ingreso, registrar ingreso, bancos, cuentas por cobrar, abono
1. Pulsa **Registrar Ingreso** y elige la **cuenta bancaria**.
2. Elige la factura que se cobra. Si el depósito paga varias, pulsa **Agregar factura**.
3. El importe se propone solo (la suma de los saldos); corrígelo si el depósito fue distinto.
4. Pon la **fecha del depósito** y la referencia, y pulsa **Registrar Ingreso**.

### Pagar nómina y comisiones
Claves: pagar
Se pagan desde **Gerencia → 5. Nómina** (ver la ayuda de Gerencia).

### Bueno saber
Claves: Compaq, IVA, facturas
- Las facturas se emiten en Compaq; aquí solo se registran.
- Los montos siempre dicen si son con o sin IVA.

# /finance
## Finanzas (reportes)
Reportes de cuentas por cobrar y por pagar: antigüedad de saldos, pendiente de facturar, reporte de cobranza,
pagos a proveedores y estado de cuenta por proveedor. Lo usan Administración, Gerencia y Dirección.

# /finance/pending-invoices
## Pendiente de Facturar
Lo que ya se puede facturar: **anticipos** sin factura y **casas firmadas** sin factura de avance. Todo con IVA.

### Registrar una factura de avance
Claves: factura de avance, avance, facturar, anticipo amortizado, pendiente de facturar
1. En **Avances por facturar**, pulsa **Registrar Avance** en la OV y marca la casa (o casas) a facturar.
2. El sistema propone tres cifras: **importe de la factura** (la casa completa con IVA), **anticipo amortizado**
   (la parte del anticipo que le toca a esa casa) y **por cobrar** (la diferencia).
3. Captura el **folio** de la factura de Compaq y pulsa **Confirmar avance**.

### Bueno saber
Claves: última casa, anticipo, motivo
- La última casa de la OV toma todo lo que quede del anticipo, para que no sobren centavos.
- Si cambias el anticipo amortizado, el sistema pide un motivo.

# /management
## Gerencia
Tablero de Gerencia: alertas, bancos, cuentas por cobrar, OV y facturación, cuentas por pagar y nómina.
Lo usan Gerencia y Dirección.

### Las secciones
Claves: gerencia, bancos, cuentas por cobrar, cuentas por pagar, nómina, OV y facturación, pendientes
- **1. Pendientes**: lo que espera una decisión (requisiciones y anticipos por facturar).
- **2. Bancos**: saldos y movimientos (confidencial).
- **3. Cuentas por cobrar** y **4. Cuentas por pagar**.
- **OV y Facturación**: las OVs separadas en **Vigentes**, **Cerradas** (pagadas, saldo cero) y **Canceladas**.
  Nada se borra; solo se separan.
- **5. Nómina**: nómina de las cuadrillas; se libera cuando el cliente firma la casa.

### Pagar comisiones
Claves: comisión, comisiones, pagar comisión, vendedor, asesor, efectivo, bancos
Enlace: /management?nomina=comisiones
1. Entra a **Gerencia → 5. Nómina → Nómina** (vendedores) y abre **B. Por Pagar**. Cada renglón dice la factura, si
   es Anticipo o Avance, y la casa. Ahí están todas, aunque la OV ya esté cerrada.
2. Pulsa **Pagar** en el renglón, o **Pagar todo a [asesor]** para pagarle todas con un solo movimiento.
3. Revisa el monto (lo cobrado sin IVA × el % de la OV), elige **Banco** (con su cuenta) o **Efectivo** y confirma.

### Pagar la nómina de cuadrillas
Claves: nómina, pagar instaladores, cuadrillas, destajo, destajos, instalaciones, pagar todo, efectivo, bancos
Enlace: /management?nomina=destajos
1. Entra a **Gerencia → 5. Nómina → Destajos** y abre **Por pagar (doble verde)**. Cada renglón dice la casa y si es
   Muebles o Piedra. La nómina se libera cuando el cliente firma la casa.
2. Pulsa **Pagar todo a [persona]** (o paga renglón por renglón).
3. Elige el medio: **Banco** (con su cuenta) o **Efectivo**, y confirma.

### Bueno saber
Claves: cancelar, bitácora, pagos, bancos
- Todo lo que se cancela pide motivo y queda en la bitácora (quién, cuándo y qué cambió).
- Un pago sale del banco solo cuando lo ejecuta Dirección.
