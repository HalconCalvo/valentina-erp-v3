/**
 * Contextual help (the "?" in the header). Texts live in help/ayuda.md so Gabriel or each area head can edit them
 * without programming: one section per screen, started by a line "# /route".
 */
import rawHelp from './ayuda.md?raw';
import { canOpen } from '@/lib/routeAccess';

export type HelpBlock =
    | { kind: 'title' | 'task' | 'paragraph'; text: string }
    | { kind: 'bullets' | 'steps'; items: string[] };

/** A task (###) of a screen: its title, search keys ("Claves:" line) and its own blocks. */
export type HelpTask = { title: string; keywords: string[]; blocks: HelpBlock[]; link?: string };

export type HelpSection = { route: string; title: string; blocks: HelpBlock[]; tasks: HelpTask[] };

const ROUTE_LINE = /^#\s+(\/\S*)\s*$/;
const KEYS_LINE = /^Claves:\s*(.*)$/i;
const LINK_LINE = /^Enlace:\s*(\/\S*)\s*$/i;

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

function splitTasks(blocks: HelpBlock[], keywordsByTask: Map<number, string[]>, linkByTask: Map<number, string>): HelpTask[] {
    const tasks: HelpTask[] = [];
    blocks.forEach((block, i) => {
        if (block.kind === 'task') tasks.push({ title: block.text, keywords: keywordsByTask.get(i) ?? [], blocks: [], link: linkByTask.get(i) });
        else if (block.kind !== 'title' && tasks.length) tasks[tasks.length - 1].blocks.push(block);
    });
    return tasks;
}

function finishSection(route: string, blocks: HelpBlock[], keywordsByTask: Map<number, string[]>, linkByTask: Map<number, string>): HelpSection {
    const title = blocks.find((b) => b.kind === 'title');
    return { route, title: title && 'text' in title ? title.text : route, blocks, tasks: splitTasks(blocks, keywordsByTask, linkByTask) };
}

export function parseHelp(markdown: string): HelpSection[] {
    const sections: HelpSection[] = [];
    let current: { route: string; blocks: HelpBlock[]; keys: Map<number, string[]>; links: Map<number, string> } | null = null;
    const close = () => { if (current) sections.push(finishSection(current.route, current.blocks, current.keys, current.links)); };
    let afterBlank = true;
    for (const line of markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
        const route = line.match(ROUTE_LINE);
        const keys = line.trim().match(KEYS_LINE);
        const link = line.trim().match(LINK_LINE);
        if (route) {
            close();
            current = { route: route[1], blocks: [], keys: new Map(), links: new Map() };
        } else if (current && keys) {
            // D38: search keys of the last task; never shown
            const taskIndex = current.blocks.map((b) => b.kind).lastIndexOf('task');
            current.keys.set(taskIndex, keys[1].split(',').map((k) => k.trim()).filter(Boolean));
            continue;
        } else if (current && link) {
            // H70: "Ir" opens this level of the screen (e.g. /management?nomina=comisiones); never shown
            current.links.set(current.blocks.map((b) => b.kind).lastIndexOf('task'), link[1]);
            continue;
        } else if (current && line.trim()) {
            parseLine(current.blocks, line, afterBlank);
        }
        afterBlank = !line.trim();
    }
    close();
    return sections;
}

/** Lower case, without accents: "Nómina" and "nomina" are the same word. */
export function normalizeText(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\*\*/g, '');
}

function blockText(block: HelpBlock): string {
    return 'text' in block ? block.text : block.items.join(' ');
}

export type HelpSearchResult = { route: string; screen: string; task: HelpTask; score: number };

/** D38: tasks of every screen the role can open whose keys, title or text contain all the words searched. */
export function searchHelp(sections: HelpSection[], query: string, role: string): HelpSearchResult[] {
    const words = normalizeText(query).split(/\s+/).filter((w) => w.length >= 2);
    if (!words.length) return [];
    const results: HelpSearchResult[] = [];
    for (const section of sections) {
        if (!canOpen(role, section.route)) continue;
        for (const task of section.tasks) {
            const keys = normalizeText(task.keywords.join(' | '));
            const title = normalizeText(`${task.title} ${section.title}`);
            const body = normalizeText(task.blocks.map(blockText).join(' '));
            if (!words.every((w) => keys.includes(w) || title.includes(w) || body.includes(w))) continue;
            const score = words.reduce((sum, w) => sum + (keys.includes(w) ? 3 : 0) + (title.includes(w) ? 2 : 0), 0);
            const route = task.link && canOpen(role, task.link.split('?')[0]) ? task.link : section.route;
            results.push({ route, screen: section.title, task, score });
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 12);
}

/** The section whose route is the longest prefix of the screen path (/design/versions/12 → /design/versions). */
export function findHelp(sections: HelpSection[], pathname: string): HelpSection | null {
    const matches = sections.filter((s) => pathname === s.route || pathname.startsWith(`${s.route}/`));
    return matches.sort((a, b) => b.route.length - a.route.length)[0] ?? null;
}

export const HELP_SECTIONS = parseHelp(rawHelp);
