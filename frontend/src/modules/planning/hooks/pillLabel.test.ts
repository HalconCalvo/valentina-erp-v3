import { describe, expect, it } from 'vitest';
import type { CalendarPill } from '../../../api/planning-service';
import { formatPillDisplayLabel } from './usePlanning';

const pill = (custom_name: string, project_name = 'Obra Piloto') => ({ custom_name, project_name } as CalendarPill);

describe('formatPillDisplayLabel (H14)', () => {
  it('shows the baptized house before the project', () => {
    expect(formatPillDisplayLabel(pill('Cocina Obra Piloto - V1.0, Piloto, 1'))).toBe('Piloto, 1 · Obra Piloto');
  });
  it('keeps the project alone when the house is not baptized, and the legacy lot suffix', () => {
    expect(formatPillDisplayLabel(pill('Cocina Obra Piloto - V1.0'))).toBe('Obra Piloto');
    expect(formatPillDisplayLabel(pill('COCINA C/D - Lote 30'))).toBe('Obra Piloto - Lote 30');
  });
});
