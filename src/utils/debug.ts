import { SELECTORS } from '@/constants.ts';

const PREFIX = '%c[LabelSync]';
const STYLE = 'color:#8250df;font-weight:bold';

const DEBUG_KEY = 'labelsync-debug';

function readFlag(): boolean {
    try {
        return localStorage.getItem(DEBUG_KEY) === 'on';
    } catch {
        return false;
    }
}

// Off by default. Turn it on without a rebuild from the "LabelSync for JIRA"
// console context: labelSync.setDebug(true), then reload. Failure paths
// (error, probeDom, dumpCardStructure) always report, flag or not.
let enabled = readFlag();

export function setDebug(value: boolean): void {
    enabled = value;
    try {
        localStorage.setItem(DEBUG_KEY, value ? 'on' : 'off');
    } catch {
        // Storage blocked: the flag still applies for this page session.
    }
}

export function log(...args: unknown[]): void {
    if (!enabled) return;
    console.log(PREFIX, STYLE, ...args);
}

// Deliberately console.log, not console.warn: DevTools level filters routinely
// hide warnings, and a hidden diagnostic is worse than a noisy one.
export function warn(...args: unknown[]): void {
    if (!enabled) return;
    console.log(`${PREFIX} WARN`, STYLE, ...args);
}

export function error(...args: unknown[]): void {
    console.error(PREFIX, STYLE, ...args);
}

// body() always runs: only the console grouping is conditional. A logging
// helper must never decide whether program logic executes.
export function group(title: string, body: () => void): void {
    if (!enabled) {
        body();
        return;
    }
    console.groupCollapsed(PREFIX, STYLE, title);
    try {
        body();
    } finally {
        console.groupEnd();
    }
}

// Candidate selectors: the ones we ship plus the shapes Atlassian has used
// historically. Counting all of them tells us which ones still resolve.
const CANDIDATES: Record<string, string[]> = {
    board: [
        SELECTORS.board,
        '[data-testid="software-board.board-area"]',
        '[data-testid="platform-board-kit.ui.board.scroll-container"]',
        '[data-test-id="platform-board-kit.ui.board.scroll-container"]',
        '#ghx-work',
        '[data-testid*="board"]',
    ],
    column: [
        SELECTORS.column,
        '[data-testid="platform-board-kit.ui.column.draggable-column"]',
        '[data-component-selector*="column"]',
        '[data-testid*="column"]',
    ],
    columnHeader: [
        SELECTORS.columnHeader,
        '[data-testid="platform-board-kit.ui.column-title"]',
        '[data-component-selector*="column-title"]',
        '[data-testid*="column-header"]',
    ],
    card: [
        SELECTORS.card,
        '[data-testid="platform-board-kit.ui.card.card"]',
        '[data-component-selector*="card"]',
        '[data-testid*="card-container"]',
    ],
};

function countFor(selector: string): number | string {
    try {
        return document.querySelectorAll(selector).length;
    } catch (e) {
        return `INVALID SELECTOR (${(e as Error).message})`;
    }
}

function attrValues(attr: string, filter: RegExp): Record<string, number>[] {
    const counts = new Map<string, number>();
    document.querySelectorAll(`[${attr}]`).forEach((el) => {
        const value = el.getAttribute(attr) || '';
        if (!filter.test(value)) return;
        counts.set(value, (counts.get(value) || 0) + 1);
    });

    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ [attr]: value, count } as unknown as Record<string, number>));
}

function describe(el: Element): string {
    const attrs = [...el.attributes]
        .filter(({ name }) => name === 'id' || name === 'class' || name.startsWith('data-'))
        .map(({ name, value }) => `${name}="${value.length > 90 ? `${value.slice(0, 90)}…` : value}"`)
        .join(' ');

    return `<${el.tagName.toLowerCase()} ${attrs}>`;
}

// Walks up from a real card so we can see what the column wrapper looks like now.
function dumpAncestry(el: Element, levels = 8): void {
    let current: Element | null = el;
    for (let i = 0; current && i <= levels; i += 1) {
        console.log(`${i === 0 ? 'card' : `parent+${i}`}:`, describe(current), current);
        current = current.parentElement;
    }
}

export function probeDom(): void {
    console.group(PREFIX, STYLE, `DOM probe @ ${new Date().toISOString()}`);
    console.log('url:', location.href);
    console.log('readyState:', document.readyState);

    Object.entries(CANDIDATES).forEach(([role, selectors]) => {
        console.table(selectors.map((selector) => ({
            role,
            selector,
            matches: countFor(selector),
            shipped: selector === SELECTORS[role as keyof typeof SELECTORS],
        })));
    });

    console.groupCollapsed('data-component-selector values (board/column/card related)');
    console.table(attrValues('data-component-selector', /column|card|board|swimlane/i));
    console.groupEnd();

    console.groupCollapsed('data-testid values (board/column/card related)');
    console.table(attrValues('data-testid', /column|card|board|swimlane/i));
    console.groupEnd();

    console.groupCollapsed('data-test-id values (board/column/card related)');
    console.table(attrValues('data-test-id', /column|card|board|swimlane/i));
    console.groupEnd();

    const headers = document.querySelectorAll(SELECTORS.columnHeader);
    console.groupCollapsed(`column headers via shipped selector (${headers.length})`);
    headers.forEach((header, index) => {
        console.log(index, {
            ariaLabel: header.getAttribute('aria-label'),
            text: header.textContent,
        }, header);
    });
    console.groupEnd();

    const anyCard = document.querySelector(SELECTORS.card)
        || document.querySelector('[data-component-selector*="card"]')
        || document.querySelector('[data-testid*="card"]');
    console.groupCollapsed(`first card ancestry ${anyCard ? '' : '(no card found)'}`);
    if (anyCard) {
        dumpAncestry(anyCard);
        console.log('labelsContainer inside card:', anyCard.querySelector(SELECTORS.labelsContainer));
    }
    console.groupEnd();

    console.groupEnd();
}

let cardDumped = false;

// The card's own subtree, printed once: this is what we need to pick a stable
// insertion anchor when Atlassian reshuffles the card markup.
export function dumpCardStructure(card: Element, force = false): void {
    if (cardDumped && !force) return;
    cardDumped = true;

    console.group(PREFIX, STYLE, 'card structure');
    console.log('card:', describe(card), card);

    const html = card.outerHTML;
    console.log(`outerHTML (${html.length} chars${html.length > 4000 ? ', truncated to 4000' : ''}):`);
    console.log(html.slice(0, 4000));

    const rows: Record<string, unknown>[] = [];
    card.querySelectorAll('*').forEach((el) => {
        let depth = 0;
        for (let p = el.parentElement; p && p !== card; p = p.parentElement) depth += 1;
        rows.push({
            depth,
            tag: el.tagName.toLowerCase(),
            'data-testid': el.getAttribute('data-testid') || '',
            'data-component-selector': el.getAttribute('data-component-selector') || '',
            class: el.getAttribute('class') || '',
            childDivs: el.querySelectorAll(':scope > div').length,
            text: (el.textContent || '').trim().slice(0, 40),
        });
    });
    console.log(`descendants: ${rows.length}`);
    console.table(rows.slice(0, 150));

    console.log('shipped labelsContainer selector:', SELECTORS.labelsContainer,
        '->', card.querySelectorAll(SELECTORS.labelsContainer).length, 'match(es)');
    console.log('any class containing "_content" in the whole document:',
        document.querySelectorAll('[class*="_content"]').length);
    console.groupEnd();
}

declare global {
    interface Window {
        labelSync?: Record<string, unknown>;
    }
}

// Exposed so the probe can be re-run by hand once the board has fully settled:
// pick the "LabelSync for JIRA" context in the console and run labelSync.probe().
export function exposeDebugApi(extra: Record<string, unknown> = {}): void {
    window.labelSync = { probe: probeDom, setDebug, ...extra };
}
