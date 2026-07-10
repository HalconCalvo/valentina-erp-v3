"""
Generador de etiquetas ZPL para impresora Datamax O'Neil E-Class Mark IIIA
Tamaño de etiqueta: 10cm x 6.5cm = 800 x 520 dots a 203 dpi
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

    Layout (800 x 520 dots):
    - Línea 1: Cliente (grande, negrita)
    - Línea 2: Proyecto: {nombre}
    - Líneas 3-4: Instancia (hasta 2 líneas con ^FB)
    - Línea 5: TIPO N/Total (muy grande, una línea)
    - QR grande único por bulto (uuid-N)
    """
    client_truncated = client_name[:35] if client_name else ""
    project_truncated = project_name[:30] if project_name else ""
    instance_truncated = instance_name[:70] if instance_name else ""
    project_line = f"Proyecto: {project_truncated}"
    bundle_line = f"{bundle_type} {bundle_number}/{total_bundles}"
    qr_content = f"{qr_uuid}-{bundle_number}"

    zpl = f"""^XA
^CI28
^LH0,0
^PW800
^LL520

^FO30,30^A0N,44,44^FD{client_truncated}^FS
^FO30,85^A0N,30,30^FD{project_line}^FS
^FO30,120^A0N,30,30^FB450,2,0,L,0^FD{instance_truncated}^FS

^FO30,290^A0N,80,80^FD{bundle_line}^FS

^FO530,30^BQN,2,10^FDQA,{qr_content}^FS

^FO30,478^A0N,32,32^FDGrupo Incamex Koloka^FS
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
