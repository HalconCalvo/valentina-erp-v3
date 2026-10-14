import { describe, expect, it } from 'vitest';
import type { SimulatedMaterial } from '@/api/design-service';
import { coreShortages, shortageText } from './coreShortage';

const material = (over: Partial<SimulatedMaterial>): SimulatedMaterial => ({
  material_id: 1, sku: 'MDF-16', name: 'MDF 16 mm', category: 'TABLERO', required_qty: 10, available_qty: 4,
  unit: 'Hoja', is_blocking: true, status_color: 'RED', ...over,
});

describe('coreShortages (D30)', () => {
  it('lists only the blocking core material with what is missing', () => {
    const list = coreShortages([
      material({}),
      material({ material_id: 2, name: 'Bisagra', is_blocking: false, status_color: 'YELLOW' }),
    ]);
    expect(list).toHaveLength(1);
    expect(shortageText(list[0])).toBe('Falta MDF 16 mm: 6 Hoja');
  });

  it('is empty when the core material is complete', () => {
    expect(coreShortages([material({ required_qty: 3, is_blocking: false, status_color: 'GREEN' })])).toEqual([]);
    expect(coreShortages(undefined)).toEqual([]);
  });
});
