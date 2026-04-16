# VALENTINA ERP V3.5 - DOCUMENTO MAESTRO DE ARQUITECTURA

## 1. REGLAS DE ORO (INMUTABLES)
- **Trazabilidad Unitaria:** Se rastrean bultos con UUID/QR.
- **Divorcio de Materiales:** Flujos separados para MDF (Etiquetas) y Piedra (Manifiestos).
- **Trigger Contable:** La baja de inventario y registro de costo de venta ocurre al estatus "CARGADO" (escaneo al camión).
- **Semáforo Financiero:** Bloqueo de producción si el costo actual sube > 3% vs Snapshot de cotización.
- **Comisiones por Recaudo:** Solo se calculan sobre pagos reales confirmados (base antes de IVA).

## 2. ARQUITECTURA DEL SIDEBAR Y MÓDULOS
### A. NIVEL ESTRATÉGICO (Director)
- **Dashboard CEO:** Ventas/Riesgo, Rentabilidad Real, Liquidez (CxC vs CxP), y Capacidad de Planta.
- **Expediente 360:** Buscador por SalesOrder que muestra historial desde cotización hasta firma de recibido.

### B. GERENCIA Y ADMINISTRACIÓN
- **Tesorería:** Control de pagos a proveedores por "Viernes de Pago" y ejecución de nómina a destajo.
- **Cobranza:** Seguimiento de anticipos, avances de obra (por instancias) y antigüedad de saldos.

### C. DISEÑO E INGENIERÍA (El Cerebro)
- **Catálogo Maestro:** Gestión de versiones de productos y recetas (BOM).
- **Simulador de Lotes:** Agrupación de productos vendidos para Nesting (Hard Allocation de inventario).
- **Centro de Impresión:** Generación JIT de etiquetas ZPL y Manifiestos PDF.

### D. PRODUCCIÓN Y LOGÍSTICA (Piso y Calle)
- **Kanban de Producción:** Tablero de 4 carriles (MDF/Piedra/Instalación MDF/Instalación Piedra).
- **Empaque Dinámico:** Declaración de bultos física y generación de QRs finales.
- **App Logística (iPad):** Pase de lista de cuadrilla, escáner de carga y recolección de firma digital.

## 3. LÓGICA DE NÓMINA DINÁMICA
- **Líder/Ayudante:** El rol se asigna cada mañana en el iPad.
- **Pago por Destajo:** Se paga al completar la instalación (Firma del cliente) basado en los días presupuestados en la receta.


Valentina 3.5+
🗂️ BOCETO DEL NUEVO SIDEBAR (VALENTINA V3.5)

NIVEL ESTRATÉGICO
📊 DASHBOARD DIRECTIVO V3 (Centro de Mando CEO)
    📈 1. VENTAS Y RIESGO COMERCIAL (Motor y Diversificación)
      Métricas Principales: % de Avance vs Meta Mensual + Tasa de Bateo (Conversión). 
      Al dar clic (Desglose de Acción y Riesgo):
      A. Pipeline en Tránsito: Cotizaciones enviadas esperando resolución y aquellas en tu bandeja requiriendo autorización de % de margen/comisión.
      B. Aceptadas en Semáforo Rojo: El cliente aceptó, pero la Variación > cost_tolerance_percent bloquea la firma. Requiere decisión directiva para absorber o recotizar.
      C. Concentración de Clientes (Radar Riesgo): Gráfico que cruza SalesOrder por customer_id. Te advierte si más del 30% de tus ingresos del mes dependen de un solo constructor.
      D. Concentración de Vendedores (Radar Riesgo): Cruce por user_id (Ventas). Te advierte si un solo vendedor concentra un porcentaje peligroso de la facturación.

  ⚖️ 2. RENTABILIDAD PREDICTIVA Y REAL (La Verdad del Negocio)
      Métrica Principal: Margen de Utilidad Real Promedio (%) de las entregas del mes.
      Al dar clic (Desglose Pre y Post Mortem):
      A. Alerta Pre-Mortem (Inflación Viva): Monitor en tiempo real que compara el SNAPSHOT JSON (costos cotizados de OVs activas) vs el `reference_cost` actual del catálogo de materiales. Te avisa de márgenes reduciéndose antes de cortar el material.
      B. Utilidad Teórica vs. Real: Comparativa final post-entrega. Snapshot Original VS (Costo real de salida de almacén + Nómina destajos + Comisiones).
      C. Héroes y Villanos: Ranking de las 3 `SalesOrder` con mayor margen y las 3 que te generaron sangría financiera.
      D. Fuga por No Calidad (Garantías): Suma total del costo absorbido en materiales por lotes marcados con `is_warranty = True`.

  💰 3. LIQUIDEZ Y VELOCIDAD (La Sangre y el Ciclo)
      Métricas Principales: Posición Neta (CxC - CxP) + Ciclo de Conversión de Efectivo (Días promedio desde anticipo hasta estatus `COMPLETED_AND_SIGNED` / Liquidado).
      Al dar clic (Desglose Financiero):
      A. Cuentas por Cobrar (Oxígeno): Anticipos pendientes, facturas emitidas y Estimaciones validadas.
      B. Cuentas por Pagar (Peso): Obligaciones de compras (15 días, 30 días, etc.).
      C. Capital Inmovilizado (Stock): Valor monetario de tu `physical_stock` en almacén. Dinero dormido.
      D. Dinero en la Mesa (Freno Operativo): Valor de OVs en estatus `INSTALLED_PENDING_SIGN` (físicamente terminadas) que no han generado cobro por falta de documento de cierre.

  🏭 4. CAPACIDAD Y RUTA CRÍTICA (El Choque de Trenes)
      Métricas Principales: Instancias CRÍTICAS (🔴) + % de Saturación de Planta (Demanda vs Capacidad).
      Al dar clic (Desglose Operativo):
      A. Choque de Trenes: Cruza el volumen de `ProductionBatch` proyectados en el Gantt vs el límite histórico de transformación de la planta. Te avisa semanas antes si ocupas horas extras.
      B. Cuellos de Botella (🔴 Rojo): `ScheduleItem` con fecha expirada y sin avance (Diseño atorado, Almacén sin surtir). Tu látigo directo.
      C. Riesgo a Corto Plazo (🟡 Amarillo): Instancias a menos de 15 días de su límite que no han iniciado producción.
      D. Carga de Piso (🔵 Azul): Volumen actual de lotes en estatus `IN_PROGRESS`.

  ⚙️ 5. EFICIENCIA DE FÁBRICA (El Costo de Transformación)
      Métrica Principal: Costo Total por Tablero/Metro comparado vs Parámetro Meta.
      Al dar clic (Desglose de Auditoría):
      A. Volumen de Transformación: `usage_unit` totales rebajados de inventario en el mes.
      B. Costo Nómina por Tablero: (Nómina Prioridad 2 Asistencia) / Volumen procesado. Mide tiempos muertos.
      C. Costo Operativo por Tablero: (Consumibles + Gasto Fijo) / Volumen procesado.
      D. Monitor de Desperdicio: Variación entre el consumo dictado por el software de Nesting (`route_safety_factor`) vs las salidas reales (mermas físicas) del almacén.

  🔍 6. EXPEDIENTE MAESTRO 360 (El Rayos X)
      Función: Buscador maestro. Escribes cualquier ID de `SalesOrder` y en lugar de una tabla, despliega un Dashboard Individual del Proyecto:
      Ventas: Quién vendió, fecha, descuentos y archivo de cotización.
      Tesorería: Termómetro de pagos (Ej. Cobrado 60% / Restante 40% condicionado a entrega).
      Costos y Consumo (Snapshot vs. Kárdex Real): En lugar de buscar compras aisladas, el sistema compara el Costo de la Receta Presupuestada (SNAPSHOT JSON congelado el día de la venta) contra el Costo Real Valuado del Inventario al momento en que el material es consumido/comprometido para su fabricación.
      Operación: Línea de tiempo visual cruzando los estatus (`Quote` -> `SalesOrder` -> `ProductionBatch` -> `ScheduleItem` -> `Invoice`) para saber exactamente dónde está atorado el proyecto físico.

📈 GERENCIA: (Dirección, Gerencia)
		💳 1. TESORERÍA Y PAGOS (El Control Maestro de Salidas)
			Métrica Principal: Monto Total Pendiente de Pago.
			Al dar clic (Desglose en 2 acciones con "Poder Absoluto"):
			A. Pagos a Proveedores (Ejecución Directa): Se despliegan 4 tarjetas secundarias para el control del flujo:
			Pagos Inmediatos (Para este viernes).
			Pagos para el Siguiente Viernes.
			Pagos Futuros (+15 días).
			Todos los Pagos.
			(Gerencia entra, selecciona la factura/anticipo y ejecuta el pago directo sin pedir autorización).
			B. Nómina a Destajo y Comisiones: El pago a los instaladores (que ya trajeron firma) y a los vendedores.

		💰 2. COBRANZA Y FACTURACIÓN (El Oxígeno)
			Métrica Principal: Monto Total de Cobranza Viva (Todo lo facturado no cobrado + Todo lo pendiente de facturar).
			Al dar clic (Desglose en 3 bloques de presión):
			A. Anticipos (El Arranque de la OV):
			Por Facturar: Órdenes de Venta aceptadas que Administración aún no factura (Presión interna).
			Por Cobrar: Facturas de anticipo emitidas esperando el depósito del cliente (Presión externa).
			B. Avances de Obra (Cobro por Instancias):
			Por Facturar: Instancias con "Firma de Recibido" (Garantía activa) que Administración no ha facturado en Contpaqi.
			Por Cobrar: Facturas de instancias emitidas esperando el pago del cliente. (Lógica de Dominó: Al registrar este cobro, el sistema cierra automáticamente las instancias amarradas a esa factura).
			C. Antigüedad de Saldos (Cartera General): El consolidado de toda la cobranza viva:
			Al día (dentro de crédito).
			Atraso menor a 30 días.
			Atraso mayor a 30 días.

		📑 3. CONTROL DE INSTANCIAS (El Estatus Físico vs Financiero)
			Métrica Principal: Instancias Pendientes de Cierre Total.
			Al dar clic (Desglose de seguimiento atómico):
			A. Producción / Instalación: Carriles activos en la fábrica (Azules).
			B. Instalado (Sin Firma): El mueble está físicamente puesto, pero falta el documento de entrega.
			C. Terminado (Instalado CON Firma): ¡Detona la Garantía de 1 Año! El reloj de la garantía empieza a correr obligatoriamente aquí, haya pagado el cliente o no.
			D. Instancias Finalizadas (Instalado + Pagado): El ciclo muere operativamente. (Tanto Gerencia como Administración tienen el permiso para registrar el pago y mandar la instancia a este estatus).

		⚖️ 4. RENTABILIDAD (El Baño de Realidad)
			Métrica Principal: Margen de Utilidad Real Promedio (%).
			Al dar clic (El desglose para auditoría de Gerencia):
			A. Costo de la No Calidad (Garantías): Material y tiempo gastado bajo is_warranty = True.
			B. Desviación de Compras (Inflación): Variación de precios de materiales entre el día de la cotización y el día de la compra real.
			C. Héroes y Villanos: Los 3 proyectos con mayor margen y los 3 que sangraron a la empresa.
			D. Utilidad Teórica vs. Real: Comparativa del Snapshot inicial contra el margen real al cierre.

		⚙️ 5. EFICIENCIA DE FÁBRICA (El Costo de Transformación)
			Métrica Principal: Costo Total de Producción por Tablero Procesado (Comparado vs. el Parámetro Meta). Si la meta es $400 por tablero y hoy estamos en $480, se pone en rojo.
			Al dar clic (Desglose de Auditoría Diaria/Mensual):
			A. Volumen de Transformación (El Denominador): Total de hojas de MDF/Melamina y metros de Piedra consumidos en el mes (Dato real del almacén).
			B. Costo de Nómina por Tablero: (Nómina Fija de Planta + Destajos) / Tableros procesados. Si sube, hay tiempos muertos o ineficiencia de mano de obra.
			C. Costo Operativo por Tablero: (Consumibles + Gastos Fijos) / Tableros procesados. Si sube, hay desperdicio de insumos menores o el volumen no absorbe el gasto fijo.
			D. Monitor de Desperdicio (Merma Real): El cálculo ciego y automático que cruza la merma teórica autorizada por el software de Nesting, contra los retiros extras (reposiciones por error) en el Kárdex de almacén.

🛒 VENTAS: (La Trinchera Comercial)
		🎯 1. MI META Y MIS INGRESOS (El Termómetro)
			Tarjetas Secundarias (Al dar clic):
			A. Comisiones Generadas ($): El cálculo de su dinero ganado en el mes (su principal motivador).
			B. Venta Cerrada ($): Monto acumulado de Órdenes de Venta generadas.
			C. Dinero en la Calle ($): Valor de las cotizaciones que están en estatus "Enviadas".
			D. Tasa de Bateo: % de efectividad (Ganadas vs Perdidas).

		📋 2. MIS COTIZACIONES (El Archivo Comercial)
			TARJETA PRINCIPAL: Buscador General (Lupa) (Acceso al universo total: Borradores + En Revisión + Autorizadas + Aceptadas + Rechazadas/Históricas).
			Tarjetas Secundarias (Al dar clic):
			A. Nueva Cotización + Borradores: Las propuestas que está armando hoy.
			B. En Revisión (Freno): Las que mandó a Dirección y están esperando tu autorización.
			C. Autorizadas (Por Enviar): Documentos liberados que el vendedor tiene la obligación de mandar ya al cliente.
			D. El Radar de Vigencia: Cotizaciones a punto de cumplir 15 días, y cotizaciones vencidas (para que audite cuáles siguen pasando el filtro del 3% y cuáles exigen recotizar).

		💰 3. COBRANZA Y COMISIONES (El Látigo Financiero)
			TARJETA PRINCIPAL: Total de Cobranza Pendiente de sus clientes. (Regla: Cero Crédito).
			Tarjetas Secundarias (Al dar clic):
			A. Comisiones Retenidas ($): Su dinero ganado pero congelado por el sistema porque el cliente no ha pagado.
			B. Comisiones Pagables ($): Dinero liberado a Gerencia para que se le pague este viernes (el cliente ya liquidó).
			C. Anticipos Pendientes: Órdenes cerradas pero bloqueadas para Producción porque no ha caído el depósito de arranque.
			D. Facturas Pendientes de Cobro: Lista de todas las facturas (estimaciones o saldos) emitidas a sus clientes que no están liquidadas al 100%. (Su lista de llamadas de cobranza de hoy).

		🔭 4. MONITOR DE CLIENTES (Servicio Post-Venta)
			TARJETA PRINCIPAL: Barra de Búsqueda Inteligente (Lupa). (Para teclear Folio de Cotización, Orden de Venta o Cliente).
			Tarjetas Secundarias / Vista de Despliegue (Al buscar):
			Se despliega la Orden con sus Instancias exactas y su semáforo de producción para informar al cliente:
			🔘 GRIS (TIEMPO): No ha entrado a Producción.
			🔵 AZUL (EN PROCESO): Diseño generó el Lote y ya está en la cancha de Fábrica.
			🔴 ROJO (CRÍTICO): Fecha límite pasada y Diseño no ha generado el Lote.
			🟡 AMARILLO (ALERTA): Faltan 15 días o menos para que entre a producción.
			🔵🟢 AZUL/VERDE: Listo para Instalarse.
			🟢 VERDE: Instalado.

📦 COMPRAS Y ALMACÉN (Control de Entrada)
		🛒 1. REQUISICIONES (Lo que pide la fábrica)
			Métrica Principal: Total de Requisiciones Pendientes.
			Al dar clic:
			A. Nuevas Solicitudes: Lo que Producción o Diseño acaba de pedir hoy.
			B. Stock Crítico (Punto de Reorden): Alertas automáticas según los máximos y mínimos configurados por material.
			C. Aplazadas / Modificadas: Requisiciones que la Contadora no rechazó del todo, pero que mandó a "congeladora" (ej. "Se compra hasta el otro mes" o "Se cambia por material equivalente").

		📜 2. ÓRDENES DE COMPRA (El Motor de Abastecimiento)
			Métrica Principal: Buscador General (Lupa). Acceso a TODAS las OCs (históricas, recibidas y en tránsito) para auditar qué se compró y a qué precio en el pasado.
			Al dar clic:
			A. Botón Maestro: [ + NUEVA ORDEN DE COMPRA ]
			B. En Revisión (Freno): Esperando la firma electrónica del Director.
			C. Autorizadas (Por Enviar): Listas para mandarse al proveedor.
			D. Seguimiento de OCs: El listado vivo de las compras en curso, marcando su estatus exacto (En Tránsito, Recibido Parcial, Recibido Total).

		⚖️ 3. RECEPCIÓN Y MATCH A 3 VÍAS (La Aduana física y documental)
			Métrica Principal: Órdenes de Compra en Tránsito.
			Al dar clic (El flujo Almacén → Administración → Gerencia):
			A. Entregas Esperadas: El Almacenista ve qué camiones deben llegar.
			B. Recepción Abierta (Parcialidades): El Almacenista cuenta lo físico. Si pedimos 100 y llegaron 80, el sistema le permite recibir 80. La OC se parte: 80 pasan a Administración para trámite, y 20 se quedan como "Backorder" (Pendiente de entrega por el proveedor).
			C. Validación Administrativa: Las recepciones del almacén caen aquí. La Contadora revisa que la Factura del proveedor cuadre con lo que el Almacenista recibió. Si cuadra, ella le da el Visto Bueno y la manda a la pantalla de Gerencia para pago. Si hay diferencias en precio, ella gestiona la Nota de Crédito.

		🪵 4. INVENTARIO FÍSICO (El Dinero Dormido)
			Métrica Principal: Valor Total del Inventario ($).
			Al dar clic:
			A. Surtido a Producción (Regla de -3 Días): El sistema lee el Tablero Kanban. Si una Instancia se instala el viernes, el sistema le exige al Almacén surtir la receta exacta de ese Lote de Producción a más tardar el martes. (Su lista de trabajo diario).
			B. Reposiciones por Error (Mermas Reales): Salidas de almacén no planificadas en la receta original. Exige escanear el gafete del responsable y se carga directo al "Costo de No Calidad" del proyecto.
			C. Auditoría y Ajustes: El módulo contable del almacén. Incluye:
			Reporte de Valuación: Cuánto dinero hay en cada anaquel.
			aptura Ciega: Pantalla donde el auditor solo mete cantidades contadas físicamente (sin ver cuánto debería haber).
			Ajustes: Las diferencias resultantes que requieren tu autorización para cuadrar el sistema.

📐 DISEÑO E INGENIERÍA (El Cerebro Técnico)
			Métrica Principal (Dashboard Home): 4 KPIs numéricos gigantes que el diseñador ve al iniciar sesión:
			Productos en Borrador | 2) Productos en Fila (Vendidos sin Lote) | 3) Lotes en Ámbar (Frenados por material) | 4) Lotes Activos en piso.
			Al dar clic en el Sidebar (Desglose en 4 Tarjetas de Acción):

		🧬 1. CATÁLOGO DE INGENIERÍA (El Génesis)
			Concepto: La biblioteca de recetas. Aquí nacen los muebles.
			A. Gestión de Productos: Crear productos nuevos, modificar recetas (BOM) y eliminar obsoletos.
			B. Repositorio de Planos: Subir, actualizar y eliminar los PDFs, renders e isométricos de cada producto.
			C. Liberación (El Gatillo): Cambiar el estatus a "Listo" para que Ventas pueda cotizar.
			Regla Estricta: Aquí NO se imprimen etiquetas, porque un producto en el catálogo es solo una idea, aún no le pertenece a ningún cliente.

		⚖️ 2. SIMULADOR Y LOTIFICACIÓN (El Puente a Fábrica)
			Concepto: El radar de ventas y la herramienta de agrupación para Nesting.
			A. Órdenes Pendientes (El Radar): Visualizar las ventas que ya pagaron anticipo, desglosadas en Instancias individuales ("Casa 1", "Casa 2").
			B. La Mesa de Simulación: Seleccionar productos pendientes (mezclando clientes) y agruparlos por tipo de material (Lotes MDF o Lotes Piedra) cruzando la receta contra el inventario físico.
			C. Filtro Logístico (La Regla de Oro):
			Si faltan Tableros/Piedra: El Lote nace en ÁMBAR (bloqueado para sierras).
			Si faltan Herrajes/Accesorios: El Lote nace en VERDE (avanza a sierras) y el sistema permite el stock negativo.

		🚨 3. CONTROL DE DÉFICIT (La Excepción del Inventario)
			Concepto: El monitor de faltantes y el puente con Administración.
			A. Materiales en Backorder: El visor de la realidad. Lo que el simulador permitió pasar a negativo y que nos urge conseguir.
			B. Requisiciones Automáticas: Generar las peticiones formales para que Administración compre exactamente el material que está frenando a la fábrica.
			C. Seguimiento de Compras: Rastreo del estatus de esas requisiciones (Saber si la contadora ya lo pidió, si ya viene en camino o si sigue atascado).
			D. Reposición por Merma (NUEVO): El buzón donde Fábrica avisa que arruinó un material (ej. se despostilló un tablero). Diseño lo registra aquí para alertar a Administración de que debe dar de baja ese material del Kárdex o comprar un repuesto urgente, impactando el costo real del proyecto.

		🖨️ 4. CENTRO DE IMPRESIÓN Y CONTROL DE PISO (El Soporte a Fábrica)
			Concepto: La conexión Just-in-Time con el andén de salida y el monitor de las máquinas.
			A. Monitor de Lotes Activos: Visualizar los Lotes ya generados y revisar su avance real en las máquinas de corte.
			B. Botón de ALTO (Emergencia): Regla estricta: Si el cliente cambia algo de última hora, Diseño busca la instancia específica dentro del Lote activo y la bloquea. La pantalla del operador pita y le avisa que salte esa pieza sin detener el resto del tablero.
			C. Generación de Etiquetas JIT: Bandeja para emitir etiquetas adhesivas ZPL (Madera) y Manifiestos PDF (Piedra) justo cuando el operador termina de armar y las solicita.	
			D. Reimpresión y Reempaque Dinámico (NUEVO): Control total de la aduana. Si una etiqueta se daña, se reimprime. Si en la vida real un mueble no cupo en 5 cajas sino en 6, Diseño cancela los 5 QRs originales y genera 6 QRs nuevos en ese momento. Logística no puede cargar el camión hasta que esto cuadre.
			

🪚 PRODUCCIÓN Y LOGÍSTICA (La Fuerza Bruta y La Calle)
			Métrica Principal (El Pulso de la Fábrica): Total de Bultos/Instancias Activas en el piso.
			Al dar clic en el Sidebar (Desglose en 4 Tarjetas de Acción, optimizadas para Tablets/Móviles):

		🏭 1. TAREAS DE PRODUCCIÓN (El Piso de Fábrica)
			Concepto: La pantalla frente a la sierra CNC y la cortadora puente.
			A. Carriles Abiertos (MDF y Piedra): Lista de todos los Lotes de Producción generados por Diseño, ordenados estrictamente por prioridad de tiempo (Fecha Límite). Los operadores pueden ver toda la fila, permitiéndoles adelantar trabajo si terminan sus metas del día.
			B. El Botón de Arranque (🔵✓): Un lote generado nace en Azul (🔵). Antes de hacer el primer corte, el operador debe pulsar "INICIAR PRODUCCIÓN". El sistema estampa una Palomita sobre el círculo azul (🔵✓). Esto le confirma a la oficina que el material ya se está transformando.
			C. Monitor de Bloqueos (Luz Roja Parpadeante y Punto de No Retorno): Si Diseño pulsa el "Botón de ALTO" por un cambio del cliente, la tablet pita y bloquea esa pieza. Excepción Estricta: Si el Lote ya tiene la palomita (🔵✓), el sistema RECHAZA el bloqueo de Diseño y lanza una alerta: "Material ya en corte. Comuníquese por radio con el operador". No puedes des-cortar la madera.

		📦 2. EMPAQUE DINÁMICO (El Andén de Salida)
			Concepto: La aduana interna antes de subir al camión.
			A. Declaración de Bultos: El operador termina la instancia e ingresa el dato real: "Esta cocina la metí en 5 cajas y 1 de herrajes".
			B. Solicitud y Escaneo: Pide las etiquetas a Diseño (Push), las pega, escanea el QR y el semáforo cambia a 🔵🟢 AZUL/VERDE (Listo para Instalarse).

		🚚 3. LOGÍSTICA Y CUADRILLAS DINÁMICAS (El Despacho)
			Concepto: La vista exclusiva del Chofer / Líder de Instalación.
			A. Pase de Lista (Armado de Cuadrilla): Antes de ver su ruta, la App obliga al Líder (Dueño del iPad) a seleccionar de una lista desplegable quién es su ayudante el día de hoy. Esto amarra dinámicamente quién va a cobrar la parte proporcional del destajo por esa instalación.
			B. Escáner de Carga (Gatillo Financiero 💸): El Líder escanea los QRs para subir al camión. El sistema no lo deja arrancar si faltan bultos. Al confirmar carga, se ejecuta la Baja de Kárdex y el Costo de Venta contable.

		🛠️ 4. INSTALACIÓN Y CIERRE (La Trinchera)
			Concepto: La entrega en la casa del cliente.
			A. Evidencia y Firma: El Líder toma fotos por zona (INSTALADO) y recaba la Firma Digital del cliente en el iPad.
			B. Detonador de Cierre (🟢 VERDE): Al firmar, se detona la Garantía de 1 año y se libera la solicitud de cobro a Gerencia.

🏦 ADMINISTRACIÓN (La Válvula del Dinero)
			Métrica Principal (El Monitor de Salidas): Total de Cuentas por Pagar para este Viernes. (El dinero que te urge conseguir o liberar esta semana).
			Al dar clic en el Sidebar (Desglose en 4 Tarjetas de Acción):

		💳 1. CUENTAS BANCARIAS Y CAJA (El Catálogo Financiero)
			Concepto: La estructura de tus cuentas, sin saldos a la vista.
			A. Catálogo de Cuentas: Visualización de las cuentas existentes (bank_accounts: BBVA, Banorte, Caja Chica), SIN mostrar saldos reales (ya que el efectivo dinámico se mueve a inversiones que el estado de cuenta diario no refleja).
			B. Conciliación Rápida: Ingreso de transacciones manuales (gastos menores, comisiones bancarias, impuestos) que no nacen de una Orden de Venta ni de Compra.
			C. Traspasos Internos: Registrar movimientos de dinero entre tus propias cuentas.

		📤 2. CUENTAS POR PAGAR (La Salida de Sangre)
			Concepto: El control de a quién le debemos, organizado por "Viernes de Pago".
			A. Pagos para este Viernes (Urgen): Facturas a 7 días o menos. El pasivo inmediato.
			B. Pagos Próximo Viernes: Facturas a pagar entre 8 y 15 días.
			C. Pagos Futuros (+15 días): El pasivo a largo plazo para proyectar el flujo del mes.
			D. Todos los Pagos: La vista maestra (Buscador/Lupa) para auditar cualquier cuenta por pagar histórica o futura.
			(En cualquiera de estas vistas, Tesorería selecciona la factura, puede eligir de qué banco sale, y el solicita el pago a administración).

		💰 3. COBRANZA Y FACTURACIÓN (El Oxígeno)
			Métrica Principal: Monto Total de Cobranza Viva (Todo lo facturado no cobrado + Todo lo pendiente de facturar).
			Al dar clic (Desglose en 3 bloques de presión):
			A. Anticipos (El Arranque de la OV):
			Por Facturar: Órdenes de Venta aceptadas que Administración aún no factura (Presión interna).
			Por Cobrar: Facturas de anticipo emitidas esperando el depósito del cliente (Presión externa).
			B. Avances de Obra (Cobro por Instancias):
			Por Facturar: Instancias con "Firma de Recibido" (Garantía activa) que Administración no ha facturado en Contpaqi.
			Por Cobrar: Facturas de instancias emitidas esperando el pago del cliente. (Lógica de Dominó: Al registrar este cobro, el sistema cierra automáticamente las instancias amarradas a esa factura).
			C. Antigüedad de Saldos (Cartera General): El consolidado de toda la cobranza viva:
			Al día (dentro de crédito).
			Atraso menor a 30 días.
			Atraso mayor a 30 días.

		👥 4. EJECUCIÓN DE NÓMINA Y COMISIONES (El Reparto del Botín)
			Concepto: El pago automatizado al equipo interno, basado en dinero real que ya ingresó.
			A. Nómina de Instaladores (Destajo): Lista de las instalaciones que consiguieron "Firma de Cliente" en la semana. El sistema ya multiplicó los días de la receta por el tabulador del Líder y Ayudante de ese día. Tesorería solo autoriza el pago.
			B. Nómina de Vendedores (Comisión Proporcional): Regla de Oro: El vendedor cobra conforme la empresa cobra. Por cada abono o anticipo que el cliente deposita, el sistema calcula automáticamente el porcentaje de comisión del vendedor sobre ese abono (descontando estrictamente el IVA) y lo manda a esta bandeja para su pago en el corte semanal.
			C. Planta y Administrativos: Pago de días fijos (Asistencia) para el personal base.

⚙️ CONFIGURACIÓN Y ADMINISTRACIÓN (El Cuarto de Máquinas)
			Métrica Principal: Sin métricas de presión. Uso exclusivo para Dirección y Administrador del Sistema.
			Al dar clic en el Sidebar (Desglose en 3 Tarjetas de Acción estrictas):

		🏢 1. PARÁMETROS GLOBALES (El ADN del Sistema)
			Concepto: La tabla global_config donde dictas las métricas y reglas del juego.
			A. Datos Fiscales y Branding: Logo de la empresa, Razón Social, RFC, Dirección, Teléfonos (2), Email Oficial y Sitio Web.
			B. Reglas Comerciales: Margen Objetivo de Utilidad (%) y Días de Vigencia de Cotizaciones.
			C. Reglas de Producción y Costeo: % de Tolerancia en Cotizaciones (Filtro para el semáforo rojo) y Factor de Tapacanto (Metros lineales de rendimiento por cada hoja de MDF).
			D. Metas Directivas: Objetivo Anual de Ventas () y Ventas del Año Anterior.

		👥 2. REGISTRO DE USUARIOS (El Control de Acceso)
			Concepto: La tabla users. Quién entra y qué puede hacer.
			A. Gestión de Personal: Alta, baja (inactivación para no perder historial) y asignación de roles (ADMIN, VENTAS, DISENO, GERENCIA).
			B. Comisiones Base: Asignar el porcentaje de comisión que le toca a cada vendedor/usuario y su objetivo en ventas mensuales.

		⚖️ 3. REGISTRO DE IMPUESTOS (El SAT)
			Concepto: La tabla tax_rates.
			A. Tasas Activas: Gestión del catálogo de impuestos (Ej. IVA 16%, 8%, 0%) para los cálculos financieros en las cotizaciones y facturas.




Módulos Adicionales o dentro de Usuarios.
		👥 EL MOTOR DE NÓMINA DINÁMICA (Sin Roles Fijos)
			Catálogo Universal de Instaladores: En la configuración solo se da de alta al personal activo en una lista general de Instaladores, sin casarlos con un puesto fijo.
			El Pase de Lista (La Asignación Diaria): Cada mañana, al abrir la App de Logística en el iPad, el sistema pregunta:
			"¿Quién es el Líder hoy?" (Asume la responsabilidad y cobra tarifa de líder).
			"¿Quién es el Ayudante hoy?" (Cobra tarifa de ayudante).
			El Cálculo Automático: Al recabar la Firma Digital del cliente, el sistema va a la Receta (que ya tiene los días de instalación de MDF y Piedra cargados) y multiplica esos días por la tarifa del rol que cada instalador asumió esa mañana específica, enviando el cálculo a Gerencia para el pago del viernes.