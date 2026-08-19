import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X, BookOpen } from 'lucide-react';

interface ModuleInfo {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  cards: { name: string; desc: string }[];
  tip?: string;
}

const MODULE_CONTENT: Record<string, ModuleInfo> = {
  parametros: {
    id: 'parametros',
    title: 'Parámetros Globales',
    subtitle: 'Configuración maestra del sistema',
    description: 'Define las reglas de negocio que se aplican automáticamente en toda la operación. Solo Dirección puede modificarlos. Un cambio aquí afecta cotizaciones, costeos y nómina.',
    cards: [
      { name: 'Identidad Corporativa', desc: 'Logo, nombre, RFC, dirección y contacto de Koloka. Aparece en todos los documentos emitidos.' },
      { name: 'Margen (45%)', desc: 'Margen mínimo requerido en cada proyecto. El sistema lo usa para calcular el precio de venta desde el costo de la receta.' },
      { name: 'Tolerancia (3%)', desc: 'Variación máxima permitida sobre el precio antes de requerir autorización de Dirección.' },
      { name: 'Vigencia (15 días)', desc: 'Días de validez de una cotización antes de que el sistema la marque como próxima a vencer.' },
      { name: 'IVA Default (16%)', desc: 'Tasa de IVA aplicada por defecto al crear cotizaciones y facturas. Se puede cambiar por línea.' },
      { name: 'Factor Tapacanto (25 ml/hoja)', desc: 'Metros lineales de tapacanto por hoja de MDF. Lo usa el costeo de materiales en las recetas de Diseño.' },
      { name: 'Metas Financieras', desc: 'Meta de ventas del año y ventas del año anterior. Alimentan los KPIs de Dirección y Gerencia.' },
      { name: 'Nómina a Destajo', desc: 'Tarifas diarias: Líder $800/día, Ayudante $700/día. Se usan en el renglón INSTALACOCINA de las recetas.' },
    ],
    tip: 'Guarda todos los cambios con un solo botón "Guardar Cambios" al final de la página.',
  },
  materiales: {
    id: 'materiales',
    title: 'Catálogo de Materiales',
    subtitle: 'Maestro de insumos y materias primas',
    description: 'Repositorio de todos los materiales que usa Koloka en fabricación. El costo de cada material (último precio de compra) alimenta el costo de las recetas en Diseño.',
    cards: [
      { name: 'SKU único', desc: 'Código identificador del material (ej. 0601-494). Permite rastrear el material en compras, recetas e inventario.' },
      { name: 'Unidad Compra → Factor → Unidad Uso', desc: 'Cómo se compra el material (ej. Millar) vs cómo se consume en fábrica (ej. Pz). El factor convierte entre ambas.' },
      { name: 'Stock mínimo / máximo', desc: 'Niveles de alerta. Cuando el stock baja del mínimo, aparece automáticamente en Requisiciones como Stock Crítico.' },
      { name: 'Costo de compra', desc: 'Precio de la última compra. Se actualiza automáticamente en cada recepción de mercancía.' },
      { name: 'Producto de reventa', desc: 'Checkbox para materiales que se venden directo al cliente sin fabricación (ej. accesorios).' },
      { name: 'Filtros', desc: 'Por SKU, nombre, categoría, o "Con Existencias". El checkbox "Ver inactivos" muestra materiales dados de baja.' },
    ],
    tip: 'Puedes exportar e importar el catálogo completo en Excel o CSV para actualizaciones masivas.',
  },
  proveedores: {
    id: 'proveedores',
    title: 'Proveedores',
    subtitle: 'Directorio de socios comerciales',
    description: 'Catálogo de todos los proveedores de Koloka con sus condiciones de crédito y contactos. Se vincula con Órdenes de Compra y Cuentas por Pagar.',
    cards: [
      { name: 'Empresa & Condiciones', desc: 'Nombre del proveedor y días de crédito acordados (ej. 30 días).' },
      { name: 'Información de Contacto', desc: 'Nombre del contacto, teléfono, email y fax/WhatsApp del representante de ventas.' },
      { name: 'RFC', desc: 'Registro Federal de Contribuyentes para facturación y compliance fiscal.' },
      { name: 'Importar / Exportar', desc: 'Botones para cargar o descargar el directorio completo en Excel o CSV.' },
    ],
    tip: 'Busca por empresa, RFC o nombre de contacto para encontrar un proveedor rápidamente.',
  },
  clientes: {
    id: 'clientes',
    title: 'Monitor Clientes',
    subtitle: 'Cartera de clientes y agenda de contactos',
    description: 'Directorio de todos los clientes de Koloka. Cada cliente puede tener múltiples contactos con roles distintos.',
    cards: [
      { name: 'Cliente / Empresa', desc: 'Nombre de la empresa y RFC. Las cotizaciones y OVs se vinculan a este registro.' },
      { name: 'Contacto Principal', desc: 'Nombre, rol (Compras, Director, Post Ventas), teléfono y email del contacto principal.' },
      { name: 'Observaciones', desc: 'Despacho de arquitectos o empresa de proyectos vinculada al cliente.' },
      { name: 'Múltiples contactos', desc: 'Un cliente puede tener varios contactos. Se muestran colapsados con "+N Contactos más".' },
    ],
  },
  usuarios: {
    id: 'usuarios',
    title: 'Usuarios y Comisiones',
    subtitle: 'Control de acceso y roles del personal',
    description: 'Gestión de todos los usuarios del sistema con sus roles y permisos. Los roles determinan qué módulos puede ver y usar cada persona.',
    cards: [
      { name: 'Roles disponibles', desc: 'DIRECCIÓN · GERENCIA · ADMINISTRACIÓN · VENTAS · DISEÑO · PRODUCCIÓN · INSTALADOR/CUADRILLA' },
      { name: 'Comisiones por vendedor', desc: 'Porcentaje de comisión sobre ventas (%) y sobre obra (%). Se muestran como badges en la lista.' },
      { name: '+ Nuevo Usuario', desc: 'Crea acceso al sistema para un nuevo miembro del equipo, asignando rol y credenciales.' },
    ],
    tip: 'Solo el rol DIRECCIÓN puede acceder a este módulo.',
  },
  impuestos: {
    id: 'impuestos',
    title: 'Registro Impuestos',
    subtitle: 'Catálogo de tasas de IVA aplicables',
    description: 'Define las tasas de IVA disponibles en el sistema. Se seleccionan al crear cotizaciones, OVs y al registrar facturas de proveedores.',
    cards: [
      { name: 'IVA Estándar (16%)', desc: 'Tasa general en México. Se aplica a la mayoría de los productos y servicios de Koloka.' },
      { name: 'IVA Frontera (8%)', desc: 'Para proyectos en zonas fronterizas del país.' },
      { name: 'Tasa Cero (0%)', desc: 'Para productos o servicios exentos de IVA.' },
      { name: '+ Nuevo Impuesto', desc: 'Agrega una tasa personalizada si se requiere.' },
      { name: 'Activar / Desactivar', desc: 'El botón ⏻ desactiva una tasa sin eliminarla.' },
    ],
  },
  diseno: {
    id: 'diseno',
    title: 'Diseño e Ingeniería',
    subtitle: 'El cerebro técnico de la empresa',
    description: 'Define qué materiales y servicios componen cada producto y a qué costo. Es el nudo que conecta todo: sin receta no hay costo, sin costo no hay precio, sin precio no hay cotización.',
    cards: [
      { name: 'Catálogo de Ingeniería', desc: 'Productos organizados por cliente. Cada producto tiene versiones (Rec 1, Rec 2, Estándar). Al hacer clic en un producto se abre el builder de receta.' },
      { name: 'Builder de Receta', desc: 'Lista de materiales con SKU, cantidad, unidad y costo. Incluye renglones de servicios: PRODUC (costo por hoja), INSTALACOCINA (costo instalación), VIATICOS.' },
      { name: 'Versiones', desc: 'Un producto puede tener múltiples versiones activas. Cada versión tiene su propia receta y costo total.' },
      { name: 'Estado: Listo / Borrador', desc: 'Listo (bloqueado) = en producción activa. Borrador = en edición. Solo los Listo aparecen en el simulador.' },
      { name: 'Planos adjuntos', desc: 'Cada versión puede tener un plano técnico adjunto. Los operadores los consultan desde Producción → Planos.' },
      { name: 'Simulador y Lotificación', desc: 'Agrupa instancias bautizadas en lotes de producción. Cruza la receta contra inventario para detectar faltantes.' },
      { name: 'Centro de Impresión', desc: 'Genera e imprime etiquetas QR para los bultos de producción.' },
    ],
    tip: 'El costo total de la receta × margen del 45% = precio de venta sugerido en la cotización.',
  },
  ventas: {
    id: 'ventas',
    title: 'Ventas — La Trinchera Comercial',
    subtitle: 'Radar de ventas, comisiones y seguimiento de clientes',
    description: 'Módulo central del ciclo comercial. Desde aquí el vendedor crea cotizaciones, las manda a Dirección, convierte las aprobadas en OVs y da seguimiento a la cobranza.',
    cards: [
      { name: '1. Mis Ingresos', desc: 'Dashboard personal: comisiones generadas en el mes, venta cerrada vs meta, comisiones por confirmar y efectividad (% de bateo).' },
      { name: '2. Cotizaciones', desc: '5 vistas: Borradores, En Revisión (enviadas a Dirección), Autorizadas, Radar de Vigencia (próximas a vencer), Histórico General.' },
      { name: 'Editor de Cotización', desc: 'Cliente, proyecto, vigencia, % anticipo, IVA, notas de alcance y condiciones. Agrega partidas desde el Catálogo de Diseño, manual o de reventa.' },
      { name: '3. Cobranza', desc: 'Comisiones Retenidas (cliente no pagó anticipo) · Comisiones Pagables · Anticipos Pendientes · CxC (facturas por cobrar).' },
      { name: '4. Monitor Operativo', desc: 'Lista de OVs activas con estado, alertas y monto. Botón "Rayos X" abre el estado financiero completo de la OV.' },
      { name: '5. Seguimiento de OV', desc: 'Vista de casas por OV. Muestra el progreso de cada mueble por etapa agrupado por calle + lote.' },
    ],
    tip: 'El botón "+ Nueva Cotización" está siempre visible en la esquina superior derecha del módulo.',
  },
  compras: {
    id: 'compras',
    title: 'Compras y Almacén',
    subtitle: 'Control total de entrada: Requisiciones, Órdenes, Aduana e Inventario',
    description: 'Gestiona el ciclo completo de abastecimiento de materiales, desde detectar qué falta hasta recibirlo físicamente y actualizar el inventario.',
    cards: [
      { name: '1. Requisiciones', desc: 'Stock Crítico (materiales bajo el mínimo, automático) · La Congeladora (compras aplazadas) · Nueva Requisición (solicitud manual).' },
      { name: '2. Órdenes de Compra', desc: 'Solicitudes (por revisar) · Freno (pausadas) · Por Enviar (listas para el proveedor) · Todas las OC / Rayos X (historial con filtros).' },
      { name: '3. Recepción (match 3 vías)', desc: 'Verifica OC emitida + factura del proveedor + mercancía física. Permite recibir parcial y declarar "No llegará más" por partida.' },
      { name: '4. Inventario Físico', desc: 'Conteo Físico (reporte ciego → captura → ajuste) · Valuación (stock × último costo = dinero inmovilizado).' },
      { name: 'Notas de Crédito', desc: 'Ajuste de Precio (corrige costo sin mover stock) · Devolución (regresa mercancía y baja el stock).' },
    ],
    tip: 'La Recepción actualiza automáticamente el stock del material y genera el pasivo en Cuentas por Pagar.',
  },
  bautizo: {
    id: 'bautizo',
    title: 'Bautizo de Instancias',
    subtitle: 'Planeación Maestra — condición de entrada a producción',
    description: 'Proceso de asignar calle y lote a cada mueble (instancia) de una OV. Es obligatorio hacerlo ANTES de que Diseño arme los lotes. Sin dueño no hay producción.',
    cards: [
      { name: '¿Qué es una instancia?', desc: 'Cada mueble individual de una OV. Una OV de 80 closets tiene 80 instancias, cada una con su propio estado de producción.' },
      { name: 'Cuándo bautizar', desc: 'Después de generar la OV y antes de que Diseño agrupe en lotes. Puede hacerse en cualquier momento dentro de ese rango.' },
      { name: 'Cómo bautizar', desc: 'Ventas → Monitor Operativo → botón "Bautizar" de la OV. Captura Calle + Lote, usa "Sugerir" y da "Asignar".' },
      { name: 'Guardado al instante', desc: 'Cada casa se persiste en la BD inmediatamente al dar "Asignar". No hay que esperar a cerrar el modal.' },
      { name: 'Formato del nombre', desc: '"Producto, Calle, Lote" (ej. "Carey Clóset - Rec 1, Cerrada 13, E-195").' },
      { name: 'Deshacer', desc: 'El botón "Deshacer" en cada casa revierte el bautizo y devuelve las instancias al pool sin asignar.' },
    ],
    tip: '"Sin dueño no hay producción" — es la regla más importante del sistema.',
  },
  simulador: {
    id: 'simulador',
    title: 'Simulador y Lotificación',
    subtitle: 'Diseño e Ingeniería — Puente a fábrica',
    description: 'Agrupa instancias bautizadas en lotes de producción y los manda a fábrica. Cruza cada receta contra el inventario disponible para detectar faltantes antes de producir.',
    cards: [
      { name: '2A. Simulador y Lotificación', desc: 'Muestra instancias listas (bautizadas y de OVs pagadas). Agrupa por tipo de material (MDF, Piedra) y genera el lote con su folio.' },
      { name: '2B. Ver Lotes de Producción', desc: 'Lotes ya enviados a fábrica. Muestra el estado actual de cada lote en el Kanban de Producción.' },
      { name: 'Detalle del lote', desc: 'Instancias que contiene, tableros MDF por tipo, cantidad de hojas, y botones para ver Herrajes, Planos y Marcar Surtido.' },
    ],
    tip: 'Un lote puede contener instancias de distintas OVs mezcladas. Lo que no puede variar es el tipo de material del lote.',
  },
  produccion: {
    id: 'produccion',
    title: 'Producción',
    subtitle: 'Control de fábrica, lotes e instalación',
    description: 'Módulo del piso de fábrica. El Kanban muestra el avance de cada lote en tiempo real. Los estados de las instancias avanzan conforme se procesa, empaca y despacha cada mueble.',
    cards: [
      { name: '1. Piso de Producción (Kanban)', desc: 'Por Producir → En Producción → En Empaque (bultos + etiquetas QR) → Listo / Andén (esperando carga al camión).' },
      { name: 'Filtros MDF / Piedra', desc: 'Permiten al supervisor de cada área ver solo sus lotes sin distracciones.' },
      { name: 'Detalle del lote', desc: 'Instancias con materiales clave, bultos MDF y herrajes. Accesos a Herrajes, Planos y Marcar Surtido.' },
      { name: '2. Instancias en Proceso', desc: 'Vista de seguimiento de instancias en estado IN_PRODUCTION o en empaque, agrupadas por lote.' },
      { name: '3. Listas para Instalarse', desc: 'Andén de despacho. Instancias READY esperando ser cargadas al camión (pasan a CARGADO).' },
      { name: '4. Planos de Productos', desc: 'Catálogo técnico de solo lectura para el operador. Busca por producto, versión o categoría.' },
      { name: '5. Centro de Impresión', desc: 'Genera e imprime etiquetas QR para los bultos. Impresora Datamax O\'Neil E4205A Mark III.' },
    ],
  },
  logistica: {
    id: 'logistica',
    title: 'Logística e Instalación',
    subtitle: 'Jornada de Instalación',
    description: 'Coordina las cuadrillas de instalación y registra el avance en campo. Cada mueble tiene su cuadrilla asignada, fecha y tipo de instalación.',
    cards: [
      { name: 'Jornada de Instalación', desc: 'Lista de asignaciones activas por fecha. Cada tarjeta: instancia, proyecto, tipo de instalación, fecha, cuadrilla (Líder + Ayudante).' },
      { name: 'Tipos de instalación', desc: 'Instalación MDF (closets y cocinas de madera) · Instalación Piedra (granito, mármol, cuarzo). Cuadrillas distintas para cada tipo.' },
      { name: 'Estados', desc: 'CARGADO (en camión) → INSTALLED (evidencia fotográfica) → CLOSED (firma de conformidad del cliente).' },
      { name: 'Cuadrillas', desc: 'Líder + ayudante asignados. Tarifas configuradas en Parámetros Globales (Líder $800/día, Ayudante $700/día).' },
    ],
    tip: 'La firma de conformidad (CLOSED) es el último paso antes de que la instancia quede lista para facturar.',
  },
  administracion: {
    id: 'administracion',
    title: 'Administración — Tesorería',
    subtitle: 'Visión global de cuentas, autorización de pagos y bóveda',
    description: 'Centro de control financiero operativo. Desde aquí se autorizan pagos, se da seguimiento a entradas y salidas, y se gestiona la nómina y gastos menores.',
    cards: [
      { name: '1. Tareas Pendientes', desc: 'Alertas activas de compras y ventas que requieren acción. "Todo al día" cuando no hay pendientes.' },
      { name: 'Bóveda', desc: 'Saldo actual consolidado de cuentas bancarias. Solo visible para Dirección y Gerencia.' },
      { name: '2. Por Cobrar (CxC)', desc: 'Total de facturas emitidas a clientes pendientes de cobro, en tiempo real.' },
      { name: '3. Por Pagar (CxP)', desc: 'Facturas de proveedores por vencimiento. Aquí se autoriza y registra el pago.' },
      { name: '4. Nómina', desc: 'Comisiones de vendedores y destajos de instaladores pendientes. Se cierra semanalmente.' },
      { name: '5. Caja Chica', desc: 'Saldo disponible para gastos menores del día a día.' },
      { name: '6. Gastos Operativos', desc: 'Renta, luz, teléfono y otros gastos fijos recurrentes.' },
      { name: 'Estado de Cuenta Proveedor', desc: 'Dentro de CxP: historial completo de facturas, abonos y saldo de cualquier proveedor por rango de fechas.' },
    ],
  },
  gerencia: {
    id: 'gerencia',
    title: 'Gerencia — Administración V4.0',
    subtitle: 'Jerarquía operativa: pendientes, bóveda, CxC, CxP y nómina',
    description: 'Vista operativa de Gerencia con los 6 indicadores clave de la empresa para tomar decisiones de administración y dar seguimiento a la salud financiera.',
    cards: [
      { name: '1. Pendientes', desc: 'Alertas de compras y ventas que requieren atención. "Sin alertas" cuando todo está en orden.' },
      { name: '2. Bancos', desc: 'Saldo consolidado de cuentas bancarias. Solo Dirección y Gerencia pueden verlo.' },
      { name: '3. CxC', desc: 'Cuentas por cobrar totales (suma de anticipos + facturas + comisiones).' },
      { name: '4. CxP', desc: 'Cuentas por pagar ordenadas por vencimiento.' },
      { name: '5. Nómina', desc: 'Comisiones de vendedores, instalaciones y cierre semanal pendientes de pago.' },
      { name: '6. Seguimiento de OV', desc: 'Acceso al módulo de casas por OV activa para supervisar el avance operativo de todos los proyectos.' },
    ],
  },
  direccion: {
    id: 'direccion',
    title: 'Dirección Estratégica',
    subtitle: 'Cuadro de Mando Estratégico',
    description: 'Vista ejecutiva con los 7 KPIs más importantes. Permite al Director tomar decisiones estratégicas con una visión de 360° del negocio en tiempo real.',
    cards: [
      { name: '1. Ventas', desc: '% de avance vs meta mensual. Motor de ingresos. Al expandir muestra el pipeline por etapa.' },
      { name: '2. Ruta Crítica', desc: 'OVs activas con semáforo: Rojo (urgente), Amarillo (en riesgo), Azul (en proceso normal).' },
      { name: '3. Liquidez', desc: 'Posición de caja real: Bancos + CxC - CxP.' },
      { name: '4. Rentabilidad', desc: 'Costo total de producción de la semana.' },
      { name: '5. Eficiencia Fábrica', desc: 'Costo por pieza producida esta semana.' },
      { name: '6. Salidas de Capital', desc: 'OCs pendientes de autorizar. "Todo Autorizado" cuando no hay OCs esperando firma.' },
      { name: '7. Seguimiento de OV', desc: 'Mapa de casas por OV activa para supervisar el cumplimiento de entregas prometidas al cliente.' },
    ],
    tip: 'Cada tarjeta es expandible — al hacer clic muestra el desglose completo con sub-indicadores y acciones.',
  },
  planeacion: {
    id: 'planeacion',
    title: 'Planeación Maestra',
    subtitle: 'Tablero de Planeación Maestro',
    description: 'Calendario visual de todas las actividades de producción e instalación. Permite al coordinador ver qué se fabrica y qué se instala cada día, semana o mes.',
    cards: [
      { name: 'Vistas: Mes / Semana / Día', desc: 'Tres niveles de zoom temporal. Mes para visión general, Semana para programar, Día para ejecutar.' },
      { name: 'Tipos de actividad', desc: 'PM (Producción MDF) · PP (Producción Piedra) · IM (Instalación MDF) · IP (Instalación Piedra).' },
      { name: 'Panel de Salud', desc: 'Panel lateral con semáforo por OV: Críticos 🔴 · Alertas 🟡 · Planeadas ⚪ · Programadas 🟣 · En Proceso 🔵.' },
      { name: 'Buscador', desc: 'Busca por OV, cliente o proyecto para filtrar el calendario.' },
    ],
    tip: 'El Panel de Salud es la herramienta más importante para detectar proyectos en riesgo de incumplimiento.',
  },
  seguimiento: {
    id: 'seguimiento',
    title: 'Seguimiento de OV',
    subtitle: 'Casas por OV activa — accesible desde todos los módulos',
    description: 'Vista operativa del estado de cada mueble agrupado por casa para todas las OVs activas. Disponible desde Producción, Ventas, Gerencia, Dirección y Administración.',
    cards: [
      { name: 'Vista global', desc: 'Todas las OVs activas con contadores: Listas / En proceso / Pendientes / Total de casas.' },
      { name: 'Detalle por OV', desc: 'Al expandir una OV se ven todas sus casas. Al expandir una casa se ven sus muebles con checkboxes.' },
      { name: 'Checkboxes por etapa', desc: '☑ En producción · ☑ Empacado · ☑ Cargado · ☑ Instalado · ☑ Firmado. Solo lectura.' },
      { name: 'Filtro "Requieren atención"', desc: 'OVs con instancias sin asignar a casa o casas con menos del 50% de avance.' },
      { name: 'Botón Actualizar', desc: 'Recarga los datos en tiempo real sin recargar la página.' },
    ],
    tip: 'La tarjeta de acceso está en Producción (5), Ventas (5), Gerencia (6), Dirección (7) y Administración.',
  },
  gastos: {
    id: 'gastos',
    title: 'Gastos Operativos',
    subtitle: 'Administración — gastos sin Orden de Compra',
    description: 'Registro de gastos recurrentes y fijos que no pasan por una Orden de Compra. La regla es simple: si no genera OC, va aquí. Complementa a Compras y Almacén que maneja todo lo que sí tiene OC, recepción y afectación de inventario.',
    cards: [
      { name: 'Categorías disponibles', desc: 'Planta · Comunicaciones · Combustibles · Transporte · y otras categorías de gasto operativo recurrente.' },
      { name: 'Proveedor', desc: 'Proveedor del servicio o gasto (ej. CFE para luz, arrendador para renta, gasolinera para combustible).' },
      { name: 'Concepto', desc: 'Descripción del gasto (ej. "Renta agosto 2026", "Gasolina camión F-150", "Internet fibra óptica").' },
      { name: 'Importe', desc: 'Monto total del gasto incluyendo IVA.' },
      { name: 'Fecha factura / Vencimiento', desc: 'Fecha en que se emitió la factura y fecha límite de pago. El sistema alerta cuando se acerca el vencimiento.' },
      { name: 'Notas', desc: 'Campo libre para observaciones (ej. número de medidor, número de contrato, periodo que cubre).' },
      { name: '¿Qué va aquí y qué no?', desc: 'SÍ: renta, luz, agua, gas, teléfono, internet, seguros, honorarios profesionales, combustibles, suscripciones de software. NO: materiales de producción, herrajes, MDF — esos van por OC en Compras y Almacén.' },
    ],
    tip: 'La regla clave: ¿genera OC y afecta inventario? → Compras y Almacén. ¿No genera OC? → Gastos Operativos.',
  },
};

function MapaSVG({ onSelect, selected }: { onSelect: (id: string) => void; selected: string | null }) {
  const bg = (id: string, active: string, inactive: string) => selected === id ? active : inactive;
  const tx = (id: string, active: string, inactive: string) => selected === id ? active : inactive;

  return (
    <svg width="100%" viewBox="0 0 680 1190" className="block">
      <defs>
        <marker id="harr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#888780" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </marker>
      </defs>

      {/* BANDA 0 — catálogos */}
      <text x="340" y="14" textAnchor="middle" fontSize="10" fill="#888780">Catálogos base</text>

      {[
        { id:'parametros', x:18,  label:'Parámetros',  sub:'margen · IVA' },
        { id:'materiales', x:126, label:'Materiales',   sub:'SKU · costo' },
        { id:'proveedores',x:234, label:'Proveedores',  sub:'RFC · crédito' },
        { id:'clientes',   x:342, label:'Clientes',     sub:'cartera' },
        { id:'usuarios',   x:450, label:'Usuarios',     sub:'roles · comisiones' },
        { id:'impuestos',  x:558, label:'Impuestos',    sub:'0% · 8% · 16%' },
      ].map(({ id, x, label, sub }) => (
        <g key={id} className="cursor-pointer" onClick={() => onSelect(id)}>
          <rect x={x} y={22} width={102} height={46} rx={6}
            fill={bg(id,'#534AB7','#EEEDFE')} stroke={bg(id,'#3C3489','#AFA9EC')} strokeWidth="0.5"/>
          <text x={x+51} y={40} textAnchor="middle" fontSize={11} fontWeight="500"
            fill={tx(id,'#F0EFFC','#3C3489')}>{label}</text>
          <text x={x+51} y={56} textAnchor="middle" fontSize={10}
            fill={tx(id,'#CECBF6','#534AB7')}>{sub}</text>
        </g>
      ))}

      <line x1="340" y1="68" x2="340" y2="90" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 1 — Diseño */}
      <g className="cursor-pointer" onClick={() => onSelect('diseno')}>
        <rect x={80} y={90} width={524} height={56} rx={8}
          fill={bg('diseno','#534AB7','#EEEDFE')} stroke={bg('diseno','#3C3489','#AFA9EC')} strokeWidth="0.8"/>
        <text x="342" y="113" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('diseno','#F0EFFC','#3C3489')}>Diseño e Ingeniería</text>
        <text x="342" y="129" textAnchor="middle" fontSize={10}
          fill={tx('diseno','#CECBF6','#534AB7')}>Producto × versión → receta: materiales + servicios = costo unitario · Catálogo · Builder · Simulador · Impresión</text>
      </g>

      <line x1="210" y1="146" x2="148" y2="174" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>
      <line x1="474" y1="146" x2="536" y2="174" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 2 — Ventas y Compras */}
      <g className="cursor-pointer" onClick={() => onSelect('ventas')}>
        <rect x={18} y={174} width={294} height={90} rx={8}
          fill={bg('ventas','#0F6E56','#E1F5EE')} stroke={bg('ventas','#085041','#5DCAA5')} strokeWidth="0.8"/>
        <text x="165" y="196" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('ventas','#E1F5EE','#085041')}>Ventas</text>
        <text x="165" y="212" textAnchor="middle" fontSize={10}
          fill={tx('ventas','#9FE1CB','#0F6E56')}>Mis ingresos · Cotizaciones</text>
        <text x="165" y="226" textAnchor="middle" fontSize={10}
          fill={tx('ventas','#9FE1CB','#0F6E56')}>Cobranza · Monitor operativo</text>
        <text x="165" y="240" textAnchor="middle" fontSize={10}
          fill={tx('ventas','#9FE1CB','#0F6E56')}>borrador → OV → factura → cobro</text>
      </g>

      <g className="cursor-pointer" onClick={() => onSelect('compras')}>
        <rect x={370} y={174} width={294} height={90} rx={8}
          fill={bg('compras','#185FA5','#E6F1FB')} stroke={bg('compras','#0C447C','#85B7EB')} strokeWidth="0.8"/>
        <text x="517" y="196" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('compras','#E6F1FB','#0C447C')}>Compras y Almacén</text>
        <text x="517" y="212" textAnchor="middle" fontSize={10}
          fill={tx('compras','#B5D4F4','#185FA5')}>Requisiciones · Órdenes de compra</text>
        <text x="517" y="226" textAnchor="middle" fontSize={10}
          fill={tx('compras','#B5D4F4','#185FA5')}>Recepción (match 3 vías)</text>
        <text x="517" y="240" textAnchor="middle" fontSize={10}
          fill={tx('compras','#B5D4F4','#185FA5')}>Inventario · Notas de crédito</text>
      </g>

      <line x1="312" y1="220" x2="368" y2="220" stroke="#D3D1C7" strokeWidth="0.8" strokeDasharray="4 3" markerEnd="url(#harr)"/>
      <text x="340" y="215" textAnchor="middle" fontSize={9} fill="#B4B2A9">mat.</text>

      <line x1="165" y1="264" x2="258" y2="300" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 3 — Bautizo */}
      <g className="cursor-pointer" onClick={() => onSelect('bautizo')}>
        <rect x={80} y={300} width={524} height={56} rx={8}
          fill={bg('bautizo','#993556','#FBEAF0')} stroke={bg('bautizo','#72243E','#ED93B1')} strokeWidth="0.8"/>
        <text x="342" y="322" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('bautizo','#FBEAF0','#72243E')}>Bautizo de instancias — Planeación Maestra</text>
        <text x="342" y="338" textAnchor="middle" fontSize={10}
          fill={tx('bautizo','#F4C0D1','#993556')}>Asignar calle + lote a cada mueble · guardado al instante · sin dueño no hay producción</text>
        <text x="342" y="350" textAnchor="middle" fontSize={10}
          fill={tx('bautizo','#F4C0D1','#993556')}>entre generar la OV y lotificar</text>
      </g>

      <line x1="342" y1="356" x2="342" y2="380" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 4 — Simulador */}
      <g className="cursor-pointer" onClick={() => onSelect('simulador')}>
        <rect x={80} y={380} width={524} height={46} rx={8}
          fill={bg('simulador','#534AB7','#EEEDFE')} stroke={bg('simulador','#3C3489','#AFA9EC')} strokeWidth="0.8"/>
        <text x="342" y="400" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('simulador','#F0EFFC','#3C3489')}>Diseño — Simulador y Lotificación</text>
        <text x="342" y="416" textAnchor="middle" fontSize={10}
          fill={tx('simulador','#CECBF6','#534AB7')}>instancias bautizadas → cruza receta vs inventario → crea lotes → manda a fábrica</text>
      </g>

      <line x1="342" y1="426" x2="342" y2="450" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 5 — Producción */}
      <g className="cursor-pointer" onClick={() => onSelect('produccion')}>
        <rect x={80} y={450} width={524} height={80} rx={8}
          fill={bg('produccion','#854F0B','#FAEEDA')} stroke={bg('produccion','#633806','#EF9F27')} strokeWidth="0.8"/>
        <text x="342" y="472" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('produccion','#FAEEDA','#633806')}>Producción — Piso de Producción (Kanban)</text>
        <text x="342" y="488" textAnchor="middle" fontSize={10}
          fill={tx('produccion','#FAC775','#854F0B')}>Por producir → En producción → En empaque (etiquetas QR) → Listo / andén</text>
        <text x="342" y="504" textAnchor="middle" fontSize={10}
          fill={tx('produccion','#FAC775','#854F0B')}>Instancias en proceso · Listas para instalarse · Planos · Centro de impresión</text>
        <text x="342" y="520" textAnchor="middle" fontSize={10}
          fill={tx('produccion','#FAC775','#854F0B')}>IN_PRODUCTION → READY → CARGADO</text>
      </g>

      <line x1="342" y1="530" x2="342" y2="554" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 6 — Logística */}
      <g className="cursor-pointer" onClick={() => onSelect('logistica')}>
        <rect x={80} y={554} width={524} height={56} rx={8}
          fill={bg('logistica','#0F6E56','#E1F5EE')} stroke={bg('logistica','#085041','#5DCAA5')} strokeWidth="0.8"/>
        <text x="342" y="576" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('logistica','#E1F5EE','#085041')}>Logística e Instalación — Jornada de Instalación</text>
        <text x="342" y="592" textAnchor="middle" fontSize={10}
          fill={tx('logistica','#9FE1CB','#0F6E56')}>cuadrillas · MDF y Piedra · fecha programada · líder + ayudante</text>
        <text x="342" y="604" textAnchor="middle" fontSize={10}
          fill={tx('logistica','#9FE1CB','#0F6E56')}>INSTALLED → CLOSED (firma de conformidad)</text>
      </g>

      <line x1="228" y1="610" x2="165" y2="638" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>
      <line x1="456" y1="610" x2="519" y2="638" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 7 — Admin y CxP */}
      <g className="cursor-pointer" onClick={() => onSelect('administracion')}>
        <rect x={18} y={638} width={294} height={72} rx={8}
          fill={bg('administracion','#3B6D11','#EAF3DE')} stroke={bg('administracion','#27500A','#97C459')} strokeWidth="0.8"/>
        <text x="165" y="658" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('administracion','#EAF3DE','#27500A')}>Administración — Tesorería</text>
        <text x="165" y="674" textAnchor="middle" fontSize={10}
          fill={tx('administracion','#C0DD97','#3B6D11')}>Tareas · Bóveda · CxC · CxP</text>
        <text x="165" y="688" textAnchor="middle" fontSize={10}
          fill={tx('administracion','#C0DD97','#3B6D11')}>Nómina · Caja chica · Gastos operativos</text>
      </g>

      <g className="cursor-pointer" onClick={() => onSelect('gastos')}>
        <rect x={18} y={716} width={294} height={28} rx={5}
          fill={bg('gastos','#3B6D11','#C0DD97')} stroke={bg('gastos','#27500A','#97C459')} strokeWidth="0.5"/>
        <text x="165" y="730" textAnchor="middle" fontSize={10} fontWeight="500"
          fill={tx('gastos','#EAF3DE','#27500A')}>Gastos Operativos — sin OC</text>
      </g>

      <g className="cursor-pointer" onClick={() => onSelect('compras')}>
        <rect x={370} y={638} width={294} height={72} rx={8}
          fill={bg('compras','#993C1D','#FAECE7')} stroke={bg('compras','#712B13','#F0997B')} strokeWidth="0.8"/>
        <text x="517" y="658" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('compras','#FAECE7','#712B13')}>CxP — Cuentas por Pagar</text>
        <text x="517" y="674" textAnchor="middle" fontSize={10}
          fill={tx('compras','#F5C4B3','#993C1D')}>facturas recibidas por vencimiento</text>
        <text x="517" y="688" textAnchor="middle" fontSize={10}
          fill={tx('compras','#F5C4B3','#993C1D')}>estado de cuenta · pagos a proveedores</text>
      </g>

      <line x1="165" y1="710" x2="258" y2="742" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>
      <line x1="517" y1="710" x2="424" y2="742" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 8 — Gerencia */}
      <g className="cursor-pointer" onClick={() => onSelect('gerencia')}>
        <rect x={80} y={742} width={524} height={48} rx={8}
          fill={bg('gerencia','#5F5E5A','#F1EFE8')} stroke={bg('gerencia','#444441','#B4B2A9')} strokeWidth="0.8"/>
        <text x="342" y="762" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('gerencia','#F1EFE8','#444441')}>Gerencia — Administración V4.0</text>
        <text x="342" y="778" textAnchor="middle" fontSize={10}
          fill={tx('gerencia','#D3D1C7','#5F5E5A')}>Pendientes · Bancos · CxC · CxP · Nómina · Seguimiento de OV</text>
      </g>

      <line x1="342" y1="790" x2="342" y2="814" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 9 — Dirección */}
      <g className="cursor-pointer" onClick={() => onSelect('direccion')}>
        <rect x={80} y={814} width={524} height={60} rx={8}
          fill={bg('direccion','#534AB7','#EEEDFE')} stroke={bg('direccion','#3C3489','#AFA9EC')} strokeWidth="0.8"/>
        <text x="342" y="836" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('direccion','#F0EFFC','#3C3489')}>Dirección Estratégica — Cuadro de Mando</text>
        <text x="342" y="852" textAnchor="middle" fontSize={10}
          fill={tx('direccion','#CECBF6','#534AB7')}>Ventas · Ruta crítica · Liquidez · Rentabilidad · Eficiencia · Salidas capital · Seg. OV</text>
      </g>

      <line x1="342" y1="874" x2="342" y2="898" stroke="#B4B2A9" strokeWidth="1" markerEnd="url(#harr)"/>

      {/* BANDA 10 — Planeación */}
      <g className="cursor-pointer" onClick={() => onSelect('planeacion')}>
        <rect x={80} y={898} width={524} height={48} rx={8}
          fill={bg('planeacion','#0F6E56','#E1F5EE')} stroke={bg('planeacion','#085041','#5DCAA5')} strokeWidth="0.8"/>
        <text x="342" y="918" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('planeacion','#E1F5EE','#085041')}>Planeación Maestra — Tablero de Planeación Maestro</text>
        <text x="342" y="934" textAnchor="middle" fontSize={10}
          fill={tx('planeacion','#9FE1CB','#0F6E56')}>Mes / Semana / Día · PM · PP · IM · IP · Panel de Salud (semáforo por OV)</text>
      </g>

      {/* Seguimiento OV transversal */}
      <g className="cursor-pointer" onClick={() => onSelect('seguimiento')}>
        <rect x={80} y={970} width={524} height={46} rx={8}
          fill={bg('seguimiento','#534AB7','#EEEDFE')} stroke={bg('seguimiento','#3C3489','#AFA9EC')} strokeWidth="0.8"/>
        <text x="342" y="990" textAnchor="middle" fontSize={12} fontWeight="500"
          fill={tx('seguimiento','#F0EFFC','#3C3489')}>Seguimiento de OV</text>
        <text x="342" y="1006" textAnchor="middle" fontSize={10}
          fill={tx('seguimiento','#CECBF6','#534AB7')}>casas · muebles · checkboxes por etapa · accesible desde Producción, Ventas, Gerencia, Dirección y Admin</text>
      </g>

      <text x="342" y="1040" textAnchor="middle" fontSize={10} fill="#B4B2A9">
        Haz clic en cualquier bloque para ver sus tarjetas y funciones
      </text>
    </svg>
  );
}

function PanelDetalle({ info, onClose }: { info: ModuleInfo; onClose: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800 leading-tight">{info.title}</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">{info.subtitle}</p>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition-colors shrink-0 ml-2">
          <X size={14} />
        </button>
      </div>
      <p className="text-xs text-slate-600 leading-relaxed mb-3 border-l-2 border-indigo-200 pl-2.5">{info.description}</p>
      <div className="space-y-2 flex-1 overflow-y-auto pr-1">
        {info.cards.map((card, i) => (
          <div key={i} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            <p className="text-[11px] font-bold text-slate-700 mb-0.5">{card.name}</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">{card.desc}</p>
          </div>
        ))}
      </div>
      {info.tip && (
        <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 shrink-0">
          <p className="text-[11px] text-indigo-700 leading-relaxed">💡 {info.tip}</p>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const info = selected ? MODULE_CONTENT[selected] : null;

  return (
    <div className="flex h-full gap-0">
      <div className={`transition-all duration-300 ${info ? 'w-[54%]' : 'w-full'} overflow-y-auto`}>
        <div className="flex items-center gap-3 mb-3 pt-1 pr-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft size={13} /> Regresar
          </button>
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-indigo-500" />
            <h1 className="text-base font-bold text-slate-800">Manual de Valentina</h1>
          </div>
          <span className="text-xs text-slate-400">— haz clic en cualquier módulo</span>
        </div>
        <div className="pr-4">
          <MapaSVG onSelect={setSelected} selected={selected} />
        </div>
      </div>
      {info && (
        <div className="w-[46%] shrink-0 border-l border-slate-200 pl-5 pt-1 overflow-y-auto">
          <PanelDetalle info={info} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
