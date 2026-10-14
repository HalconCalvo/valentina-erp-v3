/** "#197" or "197" → 197: the recipe (version) number Design and the Excel reports use; anything else → null. */
export const recipeNumberFrom = (term: string): number | null => {
    const match = term.trim().match(/^#?\s*(\d+)$/);
    return match ? Number(match[1]) : null;
};
