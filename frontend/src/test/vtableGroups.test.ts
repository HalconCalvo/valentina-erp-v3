import { describe, expect, it } from 'vitest';
import { groupRows } from '@/components/ui/VTable';

describe('VTable groupRows (guide v2 §5: client rows inside the same table)', () => {
    it('keeps the order of first appearance and the rows of each group', () => {
        const rows = [{ c: 'B', n: 1 }, { c: 'A', n: 2 }, { c: 'B', n: 3 }];
        expect(groupRows(rows, (r) => r.c)).toEqual([
            ['B', [{ c: 'B', n: 1 }, { c: 'B', n: 3 }]],
            ['A', [{ c: 'A', n: 2 }]],
        ]);
    });
});
