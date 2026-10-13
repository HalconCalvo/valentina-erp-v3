# Obra piloto (Valentina Pruebas)

Gabriel (2026-10-12): obra inventada para operar el recorrido de punta a punta en el ambiente de pruebas, cada área
con su usuario real y en su pantalla. Nada de lo que se haga aquí cuenta.

## Ya preparado (`backend/scripts/seed_obra_piloto.py`)
- Cliente **OBRA PILOTO**.
- Receta **Cocina Obra Piloto V1.0** (lista para cotizar): muebles (MDF) y cubierta de granito, con sus líneas de
  instalación INSTALACOCINA e INSTALAGRANITO en días. Es copia de una receta real lista.

## El recorrido, área por área
| # | Área | Pantalla | Qué hace |
|---|---|---|---|
| 1 | Ventas | Ventas → Nueva cotización | Cliente OBRA PILOTO, producto Cocina Obra Piloto, **cantidad 3** (tres casas). Envía a autorización. |
| 2 | Dirección | Tablero → Ventas → Autorizaciones | Revisa sobreprecio y autoriza. |
| 3 | Ventas | Cotización | "Generar OV" con folio y fecha de una OC inventada (p. ej. OC-PILOTO-1). |
| 4 | Gerencia | Administración → CxC | Registra la factura de anticipo y su cobro (folio inventado). |
| 5 | Diseño | Planeación / Monitor | Bautiza las 3 casas (calle y lote inventados), pone fechas de producción e instalación. |
| 6 | Diseño | Planeación → Agenda de instalación | Asigna cuadrilla de muebles y de piedra (o deja una sin cuadrilla para ver la alerta roja). |
| 7 | Diseño | Diseño → Simulador | Arma un lote de MDF y uno de piedra con las 3 casas. |
| 8 | Compras y Almacén | Compras | Si falta material, requisición y OC (no se envía correo en Pruebas). |
| 9 | Producción | Piso de Producción | Mueve los lotes: En producción → Empaque; declara bultos y piezas de piedra, pide etiquetas, surte herrajes y pasa las casas a "Listo". |
| 10 | Instaladores | Campo → Carga del camión | Escanean (o escriben el código de la etiqueta) y cargan cada carril. |
| 11 | Instaladores | Campo → la casa | Fotos, "Trabajo terminado" en su carril y firma del cliente. |
| 12 | Gerencia | Administración | Factura lo instalado, registra el cobro y paga la nómina de la cuadrilla (lista para pagar tras la firma). |

## Cómo empezar de cero
`scripts/refresh_pruebas_db.sh` (copia nueva de producción) y `python3 -m scripts.seed_obra_piloto`.
