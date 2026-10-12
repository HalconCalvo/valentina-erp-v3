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

## Queda para Gabriel
1. **D17 (aplicada, reversible):** "Trabajo terminado" solo para un carril ya cargado en Logística. Antes se podía marcar
   instalado sin haber cargado el camión.
2. **Archivo de prueba en la nube de producción:** un test subió un PNG de 8 bytes
   (`field/instance_1/signature_….png`, bucket valentina-erp-v3-assets). Ya se blindaron los tests (nunca tocan la
   nube). ¿Lo borro? (no lo toco sin tu autorización).
3. **No probado en pantalla:** el carril de Piedra (no había lote de piedra en el recorrido) y la red de seguridad de
   herrajes al cargar una casa sin surtir (Calle 20, 103 quedó en Empaque sin surtir para esa prueba).
4. **Dato a sanear:** en la copia local "Tapacanto 1 mm color" tiene existencia −555.
5. **Visto sin cambio:** la barra "Bautizo masivo" del Simulador recorre la lista al marcar la primera casa.
