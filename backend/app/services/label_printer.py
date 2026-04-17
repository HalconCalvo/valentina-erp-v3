"""
Generador de etiquetas ZPL para impresora Datamax O'Neil E-Class Mark IIIA
Tamaño de etiqueta: 10cm x 6.7cm = 800 x 536 dots a 203 dpi
"""
from typing import List


def generate_zpl_label(
    bundle_number: int,
    total_bundles: int,
    bundle_type: str,          # "MDF" o "HERRAJES"
    client_name: str,
    project_name: str,
    instance_name: str,
    qr_uuid: str,
) -> str:
    """
    Genera el código ZPL para UNA etiqueta de bulto.

    Layout (800 x 536 dots):
    - Línea 1: Cliente (grande, negrita)
    - Línea 2: Proyecto
    - Línea 3: Instancia
    - Línea 4: [N/Total] — TIPO (muy grande, destacado)
    - QR Code centrado a la derecha
    """
    # Truncar textos largos para que no se salgan de la etiqueta
    client_truncated   = client_name[:35]   if client_name   else ""
    project_truncated  = project_name[:35]  if project_name  else ""
    instance_truncated = instance_name[:35] if instance_name else ""
    bundle_label = f"[{bundle_number}/{total_bundles}] {bundle_type}"

    zpl = f"""^XA
^CI28
^LH0,0
^PW800
^LL536

^FO30,30^A0N,40,40^FD{client_truncated}^FS
^FO30,90^A0N,32,32^FD{project_truncated}^FS
^FO30,140^A0N,32,32^FD{instance_truncated}^FS

^FO30,210^A0N,90,90^FD{bundle_label}^FS

^FO550,30^BQN,2,6^FDQA,{qr_uuid}^FS

^FO30,490^A0N,24,24^FDValentina ERP^FS
^FO600,490^A0N,24,24^FD{qr_uuid[:8]}^FS

^XZ"""
    return zpl


def generate_all_labels(
    client_name: str,
    project_name: str,
    instance_name: str,
    mdf_bundles: int,
    hardware_bundles: int,
    qr_uuid: str,
) -> List[str]:
    """
    Genera todas las etiquetas ZPL para una instancia.
    Orden: primero MDF, luego HERRAJES.
    Retorna una lista de strings ZPL, uno por etiqueta.
    """
    total = mdf_bundles + hardware_bundles
    labels = []
    counter = 1

    for _ in range(mdf_bundles):
        labels.append(generate_zpl_label(
            bundle_number=counter,
            total_bundles=total,
            bundle_type="MDF",
            client_name=client_name,
            project_name=project_name,
            instance_name=instance_name,
            qr_uuid=qr_uuid,
        ))
        counter += 1

    for _ in range(hardware_bundles):
        labels.append(generate_zpl_label(
            bundle_number=counter,
            total_bundles=total,
            bundle_type="HERRAJES",
            client_name=client_name,
            project_name=project_name,
            instance_name=instance_name,
            qr_uuid=qr_uuid,
        ))
        counter += 1

    return labels


def concatenate_zpl(labels: List[str]) -> str:
    """Une todas las etiquetas en un solo string ZPL para enviar a la impresora."""
    return "\n".join(labels)
