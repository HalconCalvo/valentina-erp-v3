# Buzón del asesor de Gabriel

Instrucciones del asesor para Claude Code. Se ejecutan siguiendo `CLAUDE.md` (misma autoridad que las de Gabriel
dentro de esas reglas; nada de producción fuera de lo que CLAUDE.md permite).

Formato: una instrucción por viñeta en "Pendientes". Al terminarla, Claude Code la mueve a "Hechas" con fecha, hora
(Mérida) y resultado breve.

## Pendientes

## Hechas

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
