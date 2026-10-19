import { describe, expect, it } from 'vitest';
import { matchesSearch } from '@/utils/search';

describe('matchesSearch', () => {
    it('ignores case and accents in query and fields', () => {
        expect(matchesSearch('jose', 'JOSÉ Pérez')).toBe(true);
        expect(matchesSearch('PÉREZ', null, 'jose perez')).toBe(true);
        expect(matchesSearch('maria', 'Jose', undefined)).toBe(false);
        expect(matchesSearch('  ', 'x')).toBe(true);
    });
});
