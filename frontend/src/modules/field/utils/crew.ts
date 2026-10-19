/** Field home header (Gabriel 19/10): the leader's helpers come from the day's assignments (there is no fixed crew). */
type TeamMember = { name?: string | null } | null | undefined;
type WorkdayTeamItem = { team?: { helper_1?: TeamMember; helper_2?: TeamMember } };

export const ROLE_NAMES: Record<string, string> = {
  DIRECTOR: 'Dirección', MANAGER: 'Gerencia', ADMIN: 'Administración', SALES: 'Ventas', DESIGN: 'Diseño',
  WAREHOUSE: 'Almacén', PRODUCTION: 'Producción', LOGISTICS: 'Líder de cuadrilla',
};

/** Distinct helper names of the day, in order of appearance. */
export function crewTeamNames(items: WorkdayTeamItem[]): string[] {
  const names = items.flatMap((i) => [i.team?.helper_1?.name, i.team?.helper_2?.name])
    .map((n) => (n ?? '').trim()).filter(Boolean);
  return Array.from(new Set(names));
}
