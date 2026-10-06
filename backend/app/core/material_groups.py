"""Single classification of recipe materials by when they leave the warehouse.

- MAIN: the batch's main material (TABLERO for MDF batches, PIEDRA for stone batches). Discharged when the
  batch enters production; a shortage blocks (DIRECTOR/MANAGER may authorize).
- CONSUMABLE: factory consumables (CHAPACINTA, INSUMOS). Discharged when the batch enters production; a
  shortage never blocks (stock may go negative).
- DISPATCH: hardware and anything else (HERRAJES, ACCESORIO, ELECTRODOMÉSTICO, VIDRIO, ELECTRICIDAD,
  ESPECIAL and any unclassified category). Discharged when hardware is dispatched to the instance, or at
  the truck load if it never was; a shortage never blocks.
"""

MAIN_MDF = {"TABLERO"}
MAIN_STONE = {"PIEDRA"}
FACTORY_CONSUMABLES = {"CHAPACINTA", "INSUMOS"}
DISPATCH = {"HERRAJES", "ACCESORIO", "ELECTRODOMÉSTICO", "VIDRIO", "ELECTRICIDAD", "ESPECIAL"}

MAIN = "MAIN"
CONSUMABLE = "CONSUMABLE"
DISPATCH_GROUP = "DISPATCH"


def normalize(category: str | None) -> str:
    return (category or "").strip().upper()


def is_main(category: str | None, batch_type: str | None) -> bool:
    main = MAIN_STONE if normalize(batch_type) == "PIEDRA" else MAIN_MDF
    return normalize(category) in main


def group_for(category: str | None, batch_type: str | None) -> str:
    if is_main(category, batch_type):
        return MAIN
    if normalize(category) in FACTORY_CONSUMABLES:
        return CONSUMABLE
    return DISPATCH_GROUP
