import { describe, expect, it } from 'vitest';
import { findHelp, HELP_SECTIONS, parseHelp, searchHelp } from '@/help/helpContent';

const SAMPLE = `<!-- notes for editors -->
# /sales
## Ventas
Primera línea
que sigue.

### Hacer una cotización
1. Entra.
2. Pulsa **Nueva Cotización**
   y escoge el cliente.
- Un punto.

# /design/versions
## Editor
`;

describe('help texts', () => {
    it('parses titles, paragraphs, steps with continuation and bullets', () => {
        const [sales] = parseHelp(SAMPLE);
        expect(sales.route).toBe('/sales');
        expect(sales.blocks).toEqual([
            { kind: 'title', text: 'Ventas' },
            { kind: 'paragraph', text: 'Primera línea que sigue.' },
            { kind: 'task', text: 'Hacer una cotización' },
            { kind: 'steps', items: ['Entra.', 'Pulsa **Nueva Cotización** y escoge el cliente.'] },
            { kind: 'bullets', items: ['Un punto.'] },
        ]);
    });

    it('finds the most specific screen and nothing for unknown screens', () => {
        const sections = parseHelp(SAMPLE + '# /design\n## Diseño\n');
        expect(findHelp(sections, '/design/versions/12')?.route).toBe('/design/versions');
        expect(findHelp(sections, '/design')?.route).toBe('/design');
        expect(findHelp(sections, '/salesman')).toBeNull();
        expect(findHelp(sections, '/field')).toBeNull();
    });

    it('the help file covers the first modules', () => {
        for (const route of ['/sales', '/inventory', '/design', '/treasury', '/management']) {
            expect(findHelp(HELP_SECTIONS, route)?.blocks[0]).toMatchObject({ kind: 'title' });
        }
    });

    it('keeps the search keys of each task out of the text (D38)', () => {
        const [inventory] = parseHelp('# /inventory\n## Compras\n### Comprar\nClaves: OC, orden de compra\n1. Genera la OC.\n');
        expect(inventory.blocks).toEqual([
            { kind: 'title', text: 'Compras' },
            { kind: 'task', text: 'Comprar' },
            { kind: 'steps', items: ['Genera la OC.'] },
        ]);
        expect(inventory.tasks).toEqual([{ title: 'Comprar', keywords: ['OC', 'orden de compra'],
            blocks: [{ kind: 'steps', items: ['Genera la OC.'] }] }]);
    });

    it('searches every screen the role can open, without accents or capitals (D38)', () => {
        const director = searchHelp(HELP_SECTIONS, 'NOMINA', 'DIRECTOR').map((r) => r.route);
        expect(director).toContain('/treasury');
        expect(searchHelp(HELP_SECTIONS, 'orden de compra', 'WAREHOUSE')[0]).toMatchObject({ route: '/inventory' });
        expect(searchHelp(HELP_SECTIONS, 'comisiones', 'SALES').map((r) => r.route)).toEqual(['/sales']);
        expect(searchHelp(HELP_SECTIONS, 'bancos', 'SALES')).toEqual([]);
        expect(searchHelp(HELP_SECTIONS, 'x', 'DIRECTOR')).toEqual([]);
    });

    it('every task of the help file has search keys', () => {
        const missing = HELP_SECTIONS.flatMap((s) => s.tasks.filter((t) => !t.keywords.length).map((t) => `${s.route} ${t.title}`));
        expect(missing).toEqual([]);
    });
});
