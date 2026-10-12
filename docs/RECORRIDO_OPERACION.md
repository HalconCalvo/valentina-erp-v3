# Recorrido Planeación → Producción → Logística → Campo (ROADMAP tarea 10)

Fecha: 2026-10-12. Copia local de producción. OV real: **OV-0039 Santa Loreto Etapa 4** (PROMOTORA PILSA, anticipos pagados,
4 partidas con receta, 7 casas). Se recorrieron dos casas como lo haría cada puesto; la casa **Calle 20, 34** llegó hasta la
firma del cliente.

Reglas de Gabriel aplicadas: el escaneo de carga vive solo en Logística (patio); Campo es la obra (evidencias, trabajo
terminado, firma, cierre). **D15:** la nómina de la cuadrilla solo se libera con la firma del cliente; ni la asignación
ni la carga la generan.

## Resumen

| Paso | Puesto | Resultado |
|---|---|---|
| 1. Bautizo | Ventas / Dirección | Funcionó |
| 2. Fechas y cuadrilla | Planeación | Funcionó (no genera nómina) |
| 3. Lote | Diseño (Simulador) | **Fallaba**: corregido |
| 4. Entrada a producción | Producción (tablero) | Funcionó: valida anticipo y descarga material |
| 5. Empaque, etiquetas y QR | Producción / Diseño | Funcionó; surtir herrajes en Empaque **no existía**: agregado |
| 6. Lista para instalar | Producción | Funcionó por casa; por lote **fallaba**: corregido |
| 7. Carga del camión | Logística (patio) | **Aceptaba cualquier código, contaba 0 bultos, se caía el lector y generaba nómina**: corregido |
| 8. Evidencias, trabajo terminado, firma | Campo (celular) | **La firma no cerraba nada, el botón de terminado nunca aparecía y la app no cabía en celular**: corregido |
| 9. Nómina | Administración | **Se liberaba al facturar, sin firma**: corregido (D15) |

## Paso a paso

### 1. Bautizo (Ventas → Monitor Operativo → OV-0039 → "Bautizar / Agrupar por casa")
- Dos casas: Calle 20 lote 34 (Cocina A/A2/B) y Calle 20 lote 103 (Cocina E), entrega estimada 12/12/2026.
- El nombre se arma "Producto, Calle, Lote". Funcionó.

### 2. Planeación (Planeación Maestra → panel de salud → casa)
- Fechas PM (producción MDF) e IM (instalación MDF) el 12/10; la casa aparece en el calendario y en rojo (hoy debía
  producirse y no ha entrado), correcto.
- Cuadrilla IM: líder "Prueba LOGISTICS", ayudante David Márquez. Se crea la asignación programada y **no se crea
  nómina** (D15). Funcionó.

### 3. Lote (Diseño → Simulador y Lotificación)
- **Fallo corregido:** una casa con muebles y piedra aparece en las dos listas (MDF y Piedra) y el simulador la tomaba
  como "mezcla de tipos": nunca dejaba simular un lote con una cocina que lleva cubierta. Ahora decide el tipo que el
  usuario está viendo.
- Simulación: "Lote en verde" (material principal completo). Lote **LOTE-MDF-0016** con 42 reservas.
- El aviso decía "inyectado en Producción" aunque el lote queda en "Lote por producir": se corrigió el texto.
- Visto: al marcar la primera casa aparece la barra "Bautizo masivo" y recorre la lista (se marca otra casa por error).
  Queda anotado; no se cambió.

### 4. Entrada a producción (Producción → tablero, arrastrar el lote a "En producción")
- Validó el anticipo pagado y descargó 10 materiales (tablero y consumibles de fábrica); quedaron 32 reservas de
  herrajes para el surtido. Las casas pasaron a "En producción". Funcionó.

### 5. Empaque, etiquetas y QR
- Lote a "En empaque"; bultos por casa (3 MDF + 1 herrajes y 2 + 1) y "Solicitar etiquetas".
- Centro de impresión: 2 solicitudes. El PDF trae una etiqueta por bulto con cliente, obra, casa, "MDF 1/4"… y un QR
  propio de cada bulto (código de la casa + número de bulto). Funcionó.
- **Faltante corregido:** con el lote en Empaque ya no se podía abrir su detalle, donde está "Marcar surtido" de
  herrajes. Ahora cada casa en Empaque tiene "Marcar herrajes surtidos" (mismo diálogo de confirmación).

### 6. Lista para instalar
- Arrastrar la casa a "Listo para instalarse" la dejó Lista. Funcionó.
- **Fallo corregido:** soltar un lote completo en "Listo" mandaba un estado inválido (el servidor respondía error).

### 7. Carga del camión (Logística → Instalaciones por instancia, como el líder)
- **Fallos corregidos:**
  - Se aceptaba cualquier código ("CUALQUIER-TEXTO" confirmaba la carga). Ahora solo un bulto de esa casa; también se
    puede escribir el código corto impreso en la etiqueta más el número de bulto (p. ej. `0ba3b3e6-1`) si la etiqueta
    está dañada o no hay cámara. Una casa sin etiquetas no se carga.
  - "Debes cargar 0 bultos": contaba de una cola de impresión que el PDF nunca llena. Ahora cuenta los bultos
    declarados en Empaque: "4 bultos (3 MDF + 1 herrajes)".
  - El lector de QR se caía (pantalla en blanco) cuando la cámara no arrancaba.
  - La carga generaba la nómina de la cuadrilla (contra D15). Ya no.
  - La pantalla mezclaba patio y obra (fotos, terminado, firma). Ahora es solo patio; después de cargar indica
    "Las fotos, el trabajo terminado y la firma se registran en Campo".
  - "Dirección" mostraba la dirección fiscal del cliente (vacía); ahora calle y lote de la casa.
- Probado: un código de otra casa se rechaza ("El código no es de un bulto de esta casa"); el correcto confirma.
  La casa quedó CARGADA, sus 22 materiales pasaron a costo de venta y **no hubo nómina**.

### 8. Campo (celular, como el líder)
- **Fallos corregidos:**
  - En celular el menú ocupaba media pantalla. Ahora el menú se abre con un botón (en todo el sistema, en pantallas
    chicas); los avisos salen arriba para no tapar el botón "Sincronizar".
  - La tarjeta decía "Cliente" sin nombre y "Pendiente" aunque estaba cargada: ahora el cliente y "Por cargar / En
    obra / Lista para firma / Completada".
  - El botón "Trabajo terminado" nunca aparecía (esperaba un estado que no existe). Ahora cada carril de la casa
    (Muebles, Piedra) muestra su estado y, ya cargado, su botón "Trabajo terminado" con confirmación.
  - La firma se subía y se **descartaba**: no cerraba la casa ni la asignación. Ahora la firma (solo cuando todos los
    carriles están terminados) cierra la casa, completa sus carriles, inicia la garantía de un año, libera comisiones y
    crea la nómina de la cuadrilla **lista para pagar**.
  - Se quitó el escaneo de bultos de Campo (vive solo en Logística).
  - La app solo mostraba las casas con instalación programada hoy; una instalación de varios días desaparecía al día
    siguiente. Ahora también muestra las casas ya cargadas de su cuadrilla y sin firmar.
- Probado: foto de evidencia, nota "Entrega sin pendientes", "Trabajo terminado", firma. Resultado: casa CERRADA
  (garantía al 12/10/2027), carril firmado, nómina **líder $800 + ayudante $700 lista para pagar** (días de la receta ×
  tabulador de Parámetros Globales). Administración la ve por pagar ($1,500).

### 9. Nómina
- La factura de avance pasaba a "lista para pagar" la nómina de cualquier casa no facturada, firmada o no. Ya no toca la
  nómina (D15). En producción no hay ningún registro de nómina todavía, así que no hubo que corregir datos.

## Carril de piedra (2026-10-12, tarde) — casa Calle 20, 103 (cocina con muebles y piedra)
- Planeación: IM e IP el 12/10; cuadrilla de muebles (Prueba LOGISTICS) y de piedra (Pedro Catzin + Miguel Sosa).
  **Fallo corregido:** con la casa ya en producción el editor solo dejaba programar un carril de instalación (ocultaba
  muebles si la receta tenía piedra); ahora muestra los que la receta necesita. "No aplica" decía en realidad "Sin fechas".
- Simulador (línea Piedra): "Lote en verde" (1 de Granito Blanco Dallas, 21.5 en existencia); LOTE-PIEDRA-0011.
  Entrada a producción consumió el granito; en Empaque se declararon 2 piezas; el manifiesto de viaje trae cliente,
  obra, casa, piezas, cuadrilla y el QR de la casa.
- **Fallos corregidos en la carga:**
  - El manifiesto de piedra trae el QR de la casa (sin número de bulto): la validación de muebles lo habría rechazado.
    Ahora la piedra se carga con el QR de la casa (o su código corto) y la pantalla dice "Debes cargar 2 piezas de piedra".
  - La casa tiene un solo estado: al cargar el primer carril quedaba "Cargada" y el segundo ya no podía cargarse. Ahora
    cada carril se carga si la casa está lista (o ya salió con el otro carril) y su propio lote salió de producción.
- **Fallo corregido en la firma:** la casa Calle 20, 34 (con piedra) se cerró con la firma del carril de muebles sin que
  la piedra estuviera siquiera programada. Ahora la firma exige que todos los carriles que la receta necesita estén
  asignados y terminados; Campo muestra "Sin cuadrilla asignada (Planeación)" para el que falte. (Calle 20, 34 queda
  así en la copia local como dato de prueba.)
- Campo: cada líder solo ve el botón "Trabajo terminado" de su carril (el servidor ya lo rechazaba); "BOTH" → "Muebles
  y piedra".
- Red de seguridad probada: Calle 20, 103 se cargó sin surtir herrajes; al cargar se descargaron y todo pasó a costo
  de venta.
- Resultado: muebles terminado → firma bloqueada ("va después de marcar el trabajo terminado en cada carril"); piedra
  terminada → firma → casa CERRADA, los dos carriles firmados, nómina lista para pagar: muebles Prueba LOGISTICS $800;
  piedra Pedro Catzin $800 + Miguel Sosa $700.
- Visto sin cambio: en Empaque sigue apareciendo una casa ya cerrada mientras su lote siga en empaque; la tarjeta de piedra
  hereda "Etiquetas solicitadas" de la de muebles de la misma casa; el "Track piedra" del editor hereda el estado
  general de la casa (el código lo marca como aproximación).

## Nómina de cuadrilla: de dónde salen los montos
- Monto = días de instalación de la receta × tarifa diaria.
- Tarifas: Parámetros Globales → "Tarifa Líder / día" ($800) y la del ayudante ($700) (`GlobalConfig`), solo Dirección.
- Días: `installation_days` de la versión de la receta; **no hay pantalla para capturarlo** y las 367 recetas de
  producción tienen 1 día (D18).

## Queda para Gabriel
1. D17 aprobada (2026-10-12). El PNG de prueba se borró de la nube con autorización de Gabriel.
2. **D18:** días de instalación por receta (hoy todas en 1 día).
3. Carril de piedra y red de seguridad de herrajes: probados (ver arriba).
4. **Dato a sanear:** en la copia local "Tapacanto 1 mm color" tiene existencia −555.
5. **Visto sin cambio:** la barra "Bautizo masivo" del Simulador recorre la lista al marcar la primera casa.
