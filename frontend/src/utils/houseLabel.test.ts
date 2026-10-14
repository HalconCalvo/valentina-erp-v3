import { describe, expect, it } from 'vitest';
import { houseLabel, matchesSearch } from './houseLabel';

describe('houseLabel (H27/H14)', () => {
  it('uses street and lot when baptized with them', () => {
    expect(houseLabel({ custom_name: 'Cocina - V1.0', street: 'Flamboyanes', lot: '12' })).toBe('Flamboyanes, 12');
  });
  it('takes the house from the baptized name', () => {
    expect(houseLabel({ custom_name: 'Cocina Obra Piloto - V1.0, Piloto, 1' })).toBe('Piloto, 1');
  });
  it('falls back to the name', () => {
    expect(houseLabel({ custom_name: 'Cocina Obra Piloto' })).toBe('Cocina Obra Piloto');
  });
});

describe('matchesSearch (H26)', () => {
  it('finds by OV, client or house ignoring case and accents', () => {
    const fields = ['OV-0157', 'OBRA PILOTO', 'Cocina, Piloto, 1', 'Mérida'];
    expect(matchesSearch('ov-0157', fields)).toBe(true);
    expect(matchesSearch('piloto, 1', fields)).toBe(true);
    expect(matchesSearch('merida', fields)).toBe(true);
    expect(matchesSearch('OV-0158', fields)).toBe(false);
    expect(matchesSearch('  ', fields)).toBe(true);
  });
});
