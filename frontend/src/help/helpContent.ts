/**
 * Contextual help (the "?" in the header). Texts live in help/ayuda.md so Gabriel or each area head can edit them
 * without programming: one section per screen, started by a line "# /route".
 */
import rawHelp from './ayuda.md?raw';

export type HelpBlock =
    | { kind: 'title' | 'task' | 'paragraph'; text: string }
    | { kind: 'bullets' | 'steps'; items: string[] };

export type HelpSection = { route: string; blocks: HelpBlock[] };

const ROUTE_LINE = /^#\s+(\/\S*)\s*$/;

function appendText(blocks: HelpBlock[], text: string, newParagraph: boolean): void {
    const last = blocks[blocks.length - 1];
    if (!newParagraph && last && (last.kind === 'bullets' || last.kind === 'steps')) {
        last.items[last.items.length - 1] += ` ${text}`;  // continuation of a list item (indented line)
    } else if (!newParagraph && last && last.kind === 'paragraph') {
        last.text += ` ${text}`;
    } else {
        blocks.push({ kind: 'paragraph', text });
    }
}

function addItem(blocks: HelpBlock[], kind: 'bullets' | 'steps', text: string): void {
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind) last.items.push(text);
    else blocks.push({ kind, items: [text] });
}

function parseLine(blocks: HelpBlock[], line: string, afterBlank: boolean): void {
    const text = line.trim();
    if (text.startsWith('### ')) blocks.push({ kind: 'task', text: text.slice(4) });
    else if (text.startsWith('## ')) blocks.push({ kind: 'title', text: text.slice(3) });
    else if (text.startsWith('- ')) addItem(blocks, 'bullets', text.slice(2));
    else if (/^\d+\.\s/.test(text)) addItem(blocks, 'steps', text.replace(/^\d+\.\s+/, ''));
    else appendText(blocks, text, afterBlank || (!line.startsWith(' ') && blocks[blocks.length - 1]?.kind !== 'paragraph'));
}

export function parseHelp(markdown: string): HelpSection[] {
    const sections: HelpSection[] = [];
    let current: HelpSection | null = null;
    let afterBlank = true;
    for (const line of markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
        const route = line.match(ROUTE_LINE);
        if (route) {
            current = { route: route[1], blocks: [] };
            sections.push(current);
        } else if (current && line.trim()) {
            parseLine(current.blocks, line, afterBlank);
        }
        afterBlank = !line.trim();
    }
    return sections;
}

/** The section whose route is the longest prefix of the screen path (/design/versions/12 → /design/versions). */
export function findHelp(sections: HelpSection[], pathname: string): HelpSection | null {
    const matches = sections.filter((s) => pathname === s.route || pathname.startsWith(`${s.route}/`));
    return matches.sort((a, b) => b.route.length - a.route.length)[0] ?? null;
}

export const HELP_SECTIONS = parseHelp(rawHelp);
