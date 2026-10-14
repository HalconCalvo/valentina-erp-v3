import { describe, expect, it } from 'vitest';
import { groupByCrew } from './loadGroups';

const row = (id: number, date: string, leader: string, name = 'Casa') => ({
  assignment_id: id, assignment_date: `${date}T15:00:00`, leader_name: leader, instance_name: name,
});

describe('groupByCrew (H36)', () => {
  const rows = [
    row(1, '2026-07-10', 'Juan'),          // late (July)
    row(2, '2026-10-16', 'Juan'),
    row(3, '2026-10-15', 'David', 'Piloto, 1'),
    row(4, '2026-10-20', 'David'),
  ];

  it('puts upcoming work first, late work last, and crews by their next job', () => {
    const groups = groupByCrew(rows, '2026-10-14', '');
    expect(groups.map((g) => g.leader)).toEqual(['David', 'Juan']);
    expect(groups[1].rows.map((r) => r.assignment_id)).toEqual([2, 1]);
  });

  it('filters by house or leader', () => {
    expect(groupByCrew(rows, '2026-10-14', 'piloto').flatMap((g) => g.rows.map((r) => r.assignment_id))).toEqual([3]);
    expect(groupByCrew(rows, '2026-10-14', 'juan')).toHaveLength(1);
  });
});
