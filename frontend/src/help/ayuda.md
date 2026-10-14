<!--
AYUDA DE VALENTINA — textos del botón "?" (arriba a la derecha).

Cómo editar (no hace falta saber programar):
- Cada pantalla empieza con una línea "# /ruta" (la dirección de la pantalla, p. ej. /sales).
  La ayuda que se muestra es la de la ruta más parecida a la pantalla abierta.
- "## Título" es el nombre de la pantalla; "### Subtítulo" es una tarea.
- Párrafos normales, listas con "- " y pasos numerados con "1. ". **Negritas** con dos asteriscos.
- Español sencillo: qué es la pantalla, quién la usa y los pasos de las tareas comunes.
- Borrador de Claude Code (14/10/2026). Lo aprueba Gabriel o el jefe de cada área.
-->

# /sales
## Ventas
Aquí el vendedor ve sus cotizaciones, sus órdenes de venta (OV), lo que le deben sus clientes y sus comisiones.
Lo usan Ventas, Gerencia y Dirección. Cada vendedor solo ve lo suyo.

Las tarjetas de arriba son: **1. Mis Ingresos** (lo vendido en el mes contra tu meta y tu comisión),
**2. Cotizaciones**, **3. Cobranza**, **4. Monitor Operativo** y **5. Seguimiento** (cómo va cada casa de tus OVs).

### Hacer una cotización
1. Entra a **2. Cotizaciones** y pulsa **Nueva Cotización**.
2. Escoge el cliente y agrega los productos (salen del catálogo de Diseño) con su cantidad.
3. Revisa el precio. Si el **Sobreprecio %** queda en rojo, está por debajo del mínimo: se puede mandar, pero
   Dirección lo verá marcado.
4. Pulsa **Solicitar autorización**. La cotización queda "En revisión" hasta que Dirección la autorice.

### Cuando Dirección autoriza
- La cotización pasa a "Autorizada" y ya se le puede enviar al cliente (botón de PDF).
- Si Dirección pide cambios, vuelve a ti con el motivo: corrige y envía otra vez.

### Convertir en orden de venta (OV)
1. Cuando el cliente manda su orden de compra (OC), abre la cotización autorizada.
2. Pulsa **Generar OV** y captura el folio y la fecha de la OC del cliente.
3. La OV nace "Esperando anticipo". Cuando Administración registra el cobro del anticipo, pasa a vendida.

### Bautizar las casas
El bautizo (calle y lote de cada casa) lo hace **solo Ventas**: en la tarjeta **4. Monitor Operativo** o en el detalle
de la OV con **Gestionar Identidad / Bautizar**. Diseño y Producción ya ven las casas con su nombre.

### Cambiar una OV ya vendida
Todo cambio de dinero (agregar partidas, cambiar cantidades o precios, cancelar partidas) se hace con una
**orden de cambio** (CAM-OV-n). Dirección la autoriza y después se aplica. Solo puede haber una abierta a la vez.
La descripción comercial sí se corrige directo.

### Palabras que verás
- **Sobreprecio %**: lo que se le suma al costo para fijar el precio.
- **Margen neto % sobre venta**: lo que queda de la venta después del costo y la comisión. Sirve para analizar.
- **Comisión**: porcentaje sobre la venta sin IVA.

# /quotations
## Cotización
Captura o detalle de una cotización. Ver la ayuda de **Ventas** para los pasos completos.

### Estados de una cotización
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
1. Entra a **1. Solicitud de Compra**.
2. Escoge el material (busca por nombre o código) y la cantidad.
3. Guarda. La solicitud queda pendiente para Compras. Los materiales bajo su mínimo también aparecen solos.

### Comprar (2. Generar Órdenes de Compra)
1. Entra a **2. Generar Órdenes de Compra**.
2. Asigna el proveedor a cada solicitud y genera la orden de compra (OC).
3. Gerencia autoriza las órdenes de compra.

### Recibir mercancía (3. Recepción)
1. Cuando llega el proveedor, abre **3. Recepción** y escoge la OC.
2. Captura lo que realmente llegó y el folio de la factura del proveedor.
3. Al guardar, sube la existencia y se actualiza el costo del material.

### Inventario y conteo físico
- **4a. Valuación**: cuánto dinero hay en almacén, por artículo.
- **4b. Conteo Físico**: el contador captura lo que cuenta **sin ver** lo que dice el sistema. Si la diferencia
  es grande, Gerencia o Dirección la aprueban. Al aprobar el corte, el mes queda cerrado.
- **8. Kárdex**: todos los movimientos de un material (entradas y salidas) con fecha.

### Bueno saber
- Solo los materiales con ruta **MATERIAL** llevan existencia. Los consumibles, servicios y procesos no.
- El tablero o la piedra se descargan al **entrar a producción**; herrajes y accesorios, al **surtir**.

# /design
## Diseño e Ingeniería
Aquí se hacen las recetas: qué materiales y procesos lleva cada producto y cuánto cuesta. Con ellas Ventas
cotiza y Producción fabrica. Lo usan Diseño, Gerencia y Dirección.

### Buscar una receta
- Escribe el nombre del producto, o su número con **#** (p. ej. **#197**). El número de receta aparece junto a
  la versión y en el editor.

### Crear un producto y su receta
1. Pulsa **Nuevo Producto**, escoge el cliente y la categoría y ponle nombre.
2. Se crea la versión V1.0 en borrador. Ábrela y agrega los materiales y procesos con su cantidad.
3. Agrega la línea de instalación en días: **INSTALACOCINA** para muebles e **INSTALAGRANITO** para piedra
   (de ahí sale la nómina de la cuadrilla).
4. Cuando esté completa, cambia su estado a **LISTO**: queda bloqueada y ya se puede cotizar.

### Cambiar una receta que ya se usó
Si una versión ya está en una OV o en una cotización en revisión o autorizada, **no se puede cambiar**: se
clona y se corrige la versión nueva. Lo ya vendido conserva su receta.

### Otras pantallas de Diseño
- **Simulador**: arma los lotes de producción (MDF o piedra) con las casas listas.
- **Centro de impresión**: etiquetas y documentos para producción.
- **Plano**: cada versión puede llevar su plano adjunto (clip).

# /design/versions
## Editor de receta
Aquí se capturan los materiales y procesos de una versión. Arriba ves el producto, la versión (V1.0, V2.0…) y
su número de receta (**#**).

### Pasos
1. Agrega cada material o proceso con su cantidad en la unidad de uso.
2. Revisa el costo total abajo (se calcula solo).
3. Para cambiar el nombre de la versión usa el lápiz junto al nombre.

# /treasury
## Administración
Aquí se ven las tareas de dinero del día: lo que hay que facturar, cobrar y pagar.
Lo usan Administración, Gerencia y Dirección. Administración prepara los pagos; ejecutarlos es de Dirección.

### Las tarjetas
- **1. Tareas Pendientes**: anticipos por facturar y requisiciones pendientes.
- **2. Por Cobrar**: facturas a clientes pendientes de cobro.
- **3. Por Pagar**: facturas de proveedores y su programación de pago.
- **5. Caja Chica**: gastos operativos menores.

### Facturar y cobrar a un cliente
1. Entra a **2. Por Cobrar** y abre la OV con **Ver Rayos X y Facturar**.
2. Registra la factura (anticipo o avance) con su folio. Las facturas se emiten en Compaq; aquí solo se capturan.
3. Cuando el cliente paga, registra el abono con la fecha y la cuenta de banco.

### Bueno saber
- Las notas de crédito a clientes se emiten en Compaq y aquí solo se capturan.
- Los montos siempre dicen si son con o sin IVA.

# /finance
## Finanzas (reportes)
Reportes de cuentas por cobrar y por pagar: antigüedad de saldos, pendiente de facturar, reporte de cobranza,
pagos a proveedores y estado de cuenta por proveedor. Lo usan Administración, Gerencia y Dirección.

# /management
## Gerencia
Tablero de Gerencia: alertas, bancos, cuentas por cobrar, OV y facturación, cuentas por pagar y nómina.
Lo usan Gerencia y Dirección.

### Las secciones
- **1. Pendientes**: lo que espera una decisión (requisiciones y anticipos por facturar).
- **2. Bancos**: saldos y movimientos (confidencial).
- **3. Cuentas por cobrar** y **4. Cuentas por pagar**.
- **OV y Facturación**: las OVs separadas en **Vigentes**, **Cerradas** (pagadas, saldo cero) y **Canceladas**.
  Nada se borra; solo se separan.
- **5. Nómina**: nómina de las cuadrillas de instalación (se libera cuando el cliente firma).

### Bueno saber
- Todo lo que se cancela pide motivo y queda en la bitácora (quién, cuándo y qué cambió).
- Un pago sale del banco solo cuando lo ejecuta Dirección.
