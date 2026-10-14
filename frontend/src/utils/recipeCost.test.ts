import { describe, expect, it } from 'vitest';
import { recipeLineCost, recipeTotal } from './recipeCost';

describe('recipe cost (H2/H4)', () => {
  it('does not round each line up: only the total is rounded to cents', () => {
    const lines = [recipeLineCost(3, 0.333), recipeLineCost(1, 0.001)];
    expect(recipeTotal(lines)).toBe(1); // 0.999 + 0.001; per-line ceil would give 1.01
  });
});
