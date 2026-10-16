/**
 * Which roles open each module (menu and route level). One source for the sidebar and the help search (D38).
 */
export const ROUTE_ROLES: Record<string, string[]> = {
  '/': ['DIRECTOR', 'MANAGER', 'ADMIN', 'SALES', 'DESIGN', 'WAREHOUSE', 'PRODUCTION', 'LOGISTICS'],
  '/director': ['DIRECTOR'],
  '/management': ['DIRECTOR', 'MANAGER'],
  '/sales': ['DIRECTOR', 'MANAGER', 'SALES'],
  '/clients': ['DIRECTOR', 'MANAGER', 'SALES', 'ADMIN'],
  '/design': ['DIRECTOR', 'MANAGER', 'DESIGN'],
  '/planning': ['DIRECTOR', 'MANAGER', 'DESIGN', 'PRODUCTION', 'ADMIN', 'SALES'],
  '/inventory': ['DIRECTOR', 'MANAGER', 'ADMIN', 'WAREHOUSE', 'PRODUCTION'],
  '/production': ['DIRECTOR', 'MANAGER', 'ADMIN', 'DESIGN', 'PRODUCTION'],
  '/field': ['DIRECTOR', 'MANAGER', 'LOGISTICS', 'PRODUCTION', 'DESIGN'],
  '/treasury': ['DIRECTOR', 'MANAGER', 'ADMIN'],
  '/users': ['DIRECTOR'],
  '/tax-rates': ['DIRECTOR', 'ADMIN'],
  '/config': ['DIRECTOR'],
  // Screens reached from inside a module
  '/quotations': ['DIRECTOR', 'MANAGER', 'SALES'],
  '/finance': ['DIRECTOR', 'MANAGER', 'ADMIN'],
};

/** Roles of the most specific route that contains `path` (/design/simulator → /design). */
export function rolesForPath(path: string): string[] {
  const match = Object.keys(ROUTE_ROLES)
    .filter((route) => route !== '/' && (path === route || path.startsWith(`${route}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_ROLES[match] : ROUTE_ROLES['/'] ?? [];
}

export function canOpen(role: string, path: string): boolean {
  return rolesForPath(path).includes(role.toUpperCase().trim());
}
