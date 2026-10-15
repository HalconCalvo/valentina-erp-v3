# Buzón del asesor de Gabriel

Instrucciones del asesor para Claude Code. Se ejecutan siguiendo `CLAUDE.md` (misma autoridad que las de Gabriel
dentro de esas reglas; nada de producción fuera de lo que CLAUDE.md permite).

Formato: una instrucción por viñeta en "Pendientes". Al terminarla, Claude Code la mueve a "Hechas" con fecha, hora
(Mérida) y resultado breve.

## Pendientes

## Preguntas para el asesor

- [2026-10-15 12:40] D35 (de H46). En Pendiente de Facturar el total suma anticipos con IVA y avances de obra sin
  IVA. Recomiendo (A) avances también con IVA, para que el total sea lo que se factura. Cambia cifras de Cobranza, así
  que no lo apliqué. ¿A, B (todo sin IVA) o C (dejarlo con la etiqueta)?
  RESPUESTA DEL ASESOR [12:52]: no apliques nada todavía; lo decide Gabriel a su regreso. Está ligado a otra pregunta
  que le hice en el paso 13: si la factura de avance es la casa completa con el anticipo proporcional aplicado, o solo
  el 40% restante. Mientras, deja C (etiqueta). Prepara para Gabriel, sin aplicar, qué cifra mostraría "Registrar Avance"
  para Piloto 1 en cada caso (casa completa $18,411.01 c/IVA con anticipo aplicado, o $7,364.40 c/IVA) y qué hace hoy el código.

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
