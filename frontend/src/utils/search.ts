/** On-screen search (guide v2): ignores case and accents; empty query matches everything. */
export const normalizeSearch = (value: unknown): string =>
    String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const matchesSearch = (query: string, ...fields: unknown[]): boolean => {
    const q = normalizeSearch(query);
    return !q || fields.some((field) => normalizeSearch(field).includes(q));
};
