import { describe, expect, it } from 'vitest';
import { poStatusLabel } from '@/modules/foundations/utils/purchaseOrderStatus';

describe('poStatusLabel', () => {
    it('shows purchase order statuses in Spanish, whatever the case', () => {
        expect(poStatusLabel('DRAFT')).toBe('Borrador');
        expect(poStatusLabel('recibida_parcial')).toBe('Recibida parcial');
        expect(poStatusLabel('EN_ESPERA_ANTICIPO')).toBe('En espera de anticipo');
    });

    it('keeps an unknown status and tolerates empty values', () => {
        expect(poStatusLabel('OTRO')).toBe('OTRO');
        expect(poStatusLabel(null)).toBe('');
    });
});
