export interface ProductionInstanceSortRow {
  client_name?: string | null;
}

function localeCompareEs(a: string, b: string): number {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
}

/** Orden A-Z por cliente; sin client_name mantiene el orden relativo (estable). */
export function compareProductionInstances(
  a: ProductionInstanceSortRow,
  b: ProductionInstanceSortRow,
): number {
  return localeCompareEs(a.client_name ?? '', b.client_name ?? '');
}
