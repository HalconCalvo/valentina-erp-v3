export interface ProductionInstanceSortRow {
  client_name?: string | null;
  order_folio?: string | null;
  street?: string | null;
  lot?: string | null;
  custom_name?: string | null;
}

function localeCompareEs(a: string, b: string): number {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
}

export function orderFolioSortKey(folio: string | undefined | null): number {
  const raw = (folio ?? '').trim();
  const m = raw.match(/OV-(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return Number.MAX_SAFE_INTEGER;
}

/** Casa/Lote: street+lot del API o últimos segmentos del custom_name (bautizo). */
export function casaSortKey(row: ProductionInstanceSortRow): string {
  const street = row.street?.trim() ?? '';
  const lot = row.lot?.trim() ?? '';
  if (street || lot) {
    return [street, lot].filter(Boolean).join(', ');
  }
  const name = row.custom_name ?? '';
  const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return parts.slice(-2).join(', ');
  }
  return '';
}

export function compareProductionInstances(
  a: ProductionInstanceSortRow,
  b: ProductionInstanceSortRow,
): number {
  let cmp = localeCompareEs(a.client_name ?? '', b.client_name ?? '');
  if (cmp !== 0) return cmp;

  const ovNum = orderFolioSortKey(a.order_folio) - orderFolioSortKey(b.order_folio);
  if (ovNum !== 0) return ovNum;
  cmp = localeCompareEs(a.order_folio ?? '', b.order_folio ?? '');
  if (cmp !== 0) return cmp;

  cmp = localeCompareEs(casaSortKey(a), casaSortKey(b));
  if (cmp !== 0) return cmp;

  return localeCompareEs(a.custom_name ?? '', b.custom_name ?? '');
}
