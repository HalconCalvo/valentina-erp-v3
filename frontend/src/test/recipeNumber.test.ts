import { describe, expect, it } from 'vitest';
import { recipeNumberFrom } from '@/utils/recipeNumber';

describe('recipeNumberFrom', () => {
    it('reads the recipe number with or without #', () => {
        expect(recipeNumberFrom('#197')).toBe(197);
        expect(recipeNumberFrom(' 231 ')).toBe(231);
        expect(recipeNumberFrom('# 51')).toBe(51);
    });

    it('ignores names and mixed text', () => {
        expect(recipeNumberFrom('Cocina 197')).toBeNull();
        expect(recipeNumberFrom('')).toBeNull();
        expect(recipeNumberFrom('#')).toBeNull();
    });
});
