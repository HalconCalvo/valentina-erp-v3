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

  it('asks Compras in purchase units', () => {
    const [s] = coreShortages([material({ required_qty: 25, available_qty: 0, unit: 'm2', purchase_unit: 'Placa',
                                          conversion_factor: 4.5 })]);
    expect([s.purchaseQty, s.purchaseUnit]).toEqual([5.56, 'Placa']);
  });

  it('is empty when the core material is complete', () => {
    expect(coreShortages([material({ required_qty: 3, is_blocking: false, status_color: 'GREEN' })])).toEqual([]);
    expect(coreShortages(undefined)).toEqual([]);
  });
});
