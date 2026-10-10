/** D13: the seller (SALES) only sees sale prices, never costs or margins (the server also blanks them). */
export const COST_HIDDEN_ROLES = ['SALES'];

export const canSeeCosts = (role: string | null = localStorage.getItem('user_role')): boolean =>
    !COST_HIDDEN_ROLES.includes((role || '').toUpperCase());
