/** The house of an instance: "Calle, Lote" when baptized with street/lot, else the last two parts of its name
 *  ("Cocina Obra Piloto - V1.0, Piloto, 1" → "Piloto, 1"), else the name. */
export function houseLabel(inst: { custom_name?: string | null; street?: string | null; lot?: string | null }): string {
  const street = inst.street?.trim();
  const lot = inst.lot?.trim();
  if (street || lot) return [street, lot].filter(Boolean).join(', ');
  const name = (inst.custom_name ?? '').trim();
  const parts = name.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 3 ? parts.slice(-2).join(', ') : name;
}

/** Case- and accent-insensitive "contains" over several fields. */
export function matchesSearch(query: string, fields: Array<string | null | undefined>): boolean {
  const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return true;
  return fields.some((f) => f && norm(f).includes(q));
}
