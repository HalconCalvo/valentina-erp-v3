import type { SimulatedMaterial } from '@/api/design-service';
import { formatQty } from '@/utils/format';

export interface CoreShortage {
  materialId: number;
  name: string;
  missing: number;
  unit: string;
}

/** D30: core material (MDF board or stone) missing for the batch; any of these blocks creating it. */
export function coreShortages(materials: SimulatedMaterial[] | undefined): CoreShortage[] {
  return (materials ?? [])
    .filter((m) => m.is_blocking && m.required_qty > m.available_qty)
    .map((m) => ({
      materialId: m.material_id,
      name: m.name,
      missing: Math.round((m.required_qty - m.available_qty) * 100) / 100,
      unit: m.unit ?? '',
    }));
}

/** "Falta <material>: <cantidad> <unidad>" */
export function shortageText(s: CoreShortage): string {
  return `Falta ${s.name}: ${formatQty(s.missing)}${s.unit ? ` ${s.unit}` : ''}`;
}
