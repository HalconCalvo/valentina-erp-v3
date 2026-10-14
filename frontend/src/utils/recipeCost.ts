/** Single recipe cost rule, as the backend (recipe_cost_service): each line is exactly quantity × unit cost (no
 *  rounding per line) and only the total is rounded to cents (H2/H4: one figure in every screen). */
export const recipeLineCost = (quantity: number, unitCost: number): number =>
  (Number(quantity) || 0) * (Number(unitCost) || 0);

export const recipeTotal = (lines: number[]): number =>
  Math.round(lines.reduce((sum, line) => sum + line, 0) * 100) / 100;
