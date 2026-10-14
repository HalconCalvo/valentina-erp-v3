import { matchesSearch } from '@/utils/houseLabel';

export interface LoadRow {
  assignment_id: number;
  assignment_date: string | null;
  leader_name?: string | null;
  instance_name?: string | null;
  order_folio?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  client_address?: string | null;
}

export interface CrewGroup<T extends LoadRow> {
  leader: string;
  rows: T[];
}

const dayKey = (iso: string | null): string => (iso ? iso.slice(0, 10) : '9999-12-31');

/** H36 (Dirección): by crew, upcoming work first (nearest date), late work after it; crews ordered by their next
 *  job; filtered by house, OV, client, project, address or leader. */
export function groupByCrew<T extends LoadRow>(rows: T[], today: string, search: string): CrewGroup<T>[] {
  const found = rows.filter((r) => matchesSearch(search, [r.instance_name, r.order_folio, r.client_name,
    r.project_name, r.client_address, r.leader_name]));
  const rank = (r: T) => {
    const key = dayKey(r.assignment_date);
    return key >= today ? `0-${key}` : `1-${key}`;
  };
  const sorted = [...found].sort((a, b) => rank(a).localeCompare(rank(b)));
  const groups = new Map<string, T[]>();
  for (const row of sorted) {
    const leader = row.leader_name || 'Sin líder';
    groups.set(leader, [...(groups.get(leader) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([leader, list]) => ({ leader, rows: list }))
    .sort((a, b) => rank(a.rows[0]).localeCompare(rank(b.rows[0])));
}

export function isLate(row: LoadRow, today: string): boolean {
  return dayKey(row.assignment_date) < today;
}
