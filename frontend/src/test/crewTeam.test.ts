import { describe, expect, it } from 'vitest';
import { crewTeamNames } from '@/modules/field/utils/crew';

describe('crewTeamNames', () => {
    it('lists each helper of the day once, skipping empty slots', () => {
        expect(crewTeamNames([
            { team: { helper_1: { name: 'Juan' }, helper_2: null } },
            { team: { helper_1: { name: 'Pedro' }, helper_2: { name: 'Juan' } } },
            {},
        ])).toEqual(['Juan', 'Pedro']);
    });
});
