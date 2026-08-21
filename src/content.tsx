import {INITIAL_SETTINGS, SELECTORS} from '@/constants.ts';
import {DataFetcher, GitLabSettings, SettingsExtended} from './types.ts';
import {buildArray, getColumnsSelector, isHTMLElement, isLightTheme} from '@/utils/utils.ts';
import {dumpCardStructure, error, exposeDebugApi, group, log, probeDom, warn} from '@/utils/debug.ts';
import ReactDOM from 'react-dom/client';
import CardDetails from '@/components/CardDetails/CardDetails.tsx';
import GitHubFetcher from '@/data/GitHubFetcher.ts';
import GitLabFetcher from '@/data/GitLabFetcher.ts';
import '@/data-tooltip.css';
import styles from '@/content.module.scss';

let settings: SettingsExtended;
let columnsSelector: string = '';
const cachedLabels: Record<string, HTMLElement> = {};
let dataFetcher: DataFetcher;

log('content script loaded', {url: location.href, readyState: document.readyState});
exposeDebugApi({
    run: () => addPRLabels(),
    getState: () => ({columnsSelector, settings, cachedIds: Object.keys(cachedLabels)}),
    dumpCard: (selector: string = SELECTORS.card) => {
        const card = document.querySelector(selector);
        return card ? dumpCardStructure(card, true) : error('no card matched', selector);
    },
});

chrome.storage.sync.get(INITIAL_SETTINGS, (items) => {
    settings = {
        ...items,
        codeReviewersLabels: buildArray(items.codeReviewersLabels as string),
        prColumns: buildArray(items.prColumns as string),
    } as SettingsExtended;

    group('settings loaded', () => {
        log('prColumns:', settings.prColumns);
        log('codeReviewersLabels:', settings.codeReviewersLabels);
        log('githubAccessToken set:', !!settings.githubAccessToken);
        log('gitlab entries:', settings.gitlab?.map((item) => ({
            projectName: item.projectName,
            hostName: item.hostName,
            accessTokenSet: !!item.accessToken,
        })));
        log('flags:', {
            ffCodeReviewers: settings.ffCodeReviewers,
            ffCompactReviewers: settings.ffCompactReviewers,
            ffShortName: settings.ffShortName,
            hideClosedPRs: settings.hideClosedPRs,
            hideLabelsOnClosedPRs: settings.hideLabelsOnClosedPRs,
        });
    });

    log('scheduling addPRLabels in 1500ms');
    setTimeout(() => {
        try {
            addPRLabels();
        } catch (e) {
            error('addPRLabels failed:', (e as Error).message);
            probeDom();
        }
    }, 1500);
});

// The labels sit just above the card footer. Everything is anchored on data
// attributes: Jira's class names are Compiled atomic hashes and change per build.
function attachLabels(card: HTMLElement, labels: HTMLElement): string {
    const footer = card.querySelector(SELECTORS.labelsContainer);
    if (footer) {
        if (labels.nextElementSibling === footer) {
            return 'already in place';
        }
        footer.before(labels);
        return 'before footer';
    }

    const sections = card.querySelectorAll(SELECTORS.contentSection);
    const lastSection = sections[sections.length - 1];
    if (lastSection) {
        warn('footer not found, using the last content section instead;'
            + ` footer selector is "${SELECTORS.labelsContainer}"`, card);
        lastSection.after(labels);
        return 'after last content section';
    }

    warn(`no content section found in card (selector "${SELECTORS.contentSection}")`, card);
    dumpCardStructure(card);
    card.append(labels);
    return 'appended to card';
}

function getCardId(card: HTMLElement): string | undefined {
    const idAttr = card.getAttribute('id') || card.dataset.id;
    if (idAttr) {
        return idAttr;
    }
    // A card body re-rendered without its container: recover the key from the card itself.
    const cardKey = card.querySelector(SELECTORS.cardKey)?.textContent?.trim();
    if (!cardKey) {
        return undefined;
    }
    card.dataset.id = `card-${cardKey}`;
    return card.dataset.id;
}

async function populateIssueCard(card: HTMLElement) {
    const idAttr = getCardId(card);
    if (!idAttr) {
        error('card has no id and no readable key, skipping', card);
        return;
    }
    if (!cachedLabels[idAttr]) {
        log('mounting CardDetails for', idAttr);
        const root = document.createElement('div');
        // Marks our own node so the observer does not react to its own insertions.
        root.dataset.labelsync = idAttr;
        cachedLabels[idAttr] = root;

        ReactDOM.createRoot(root).render(
            <CardDetails cardId={idAttr} settings={settings} dataFetcher={dataFetcher} />
        );
    }

    const strategy = attachLabels(card, cachedLabels[idAttr]);
    log('labels attached to card', idAttr, `(${strategy})`);
}

function findCard(node: HTMLElement): HTMLElement | null {
    if (node.matches(SELECTORS.card)) {
        return node;
    }
    return node.querySelector<HTMLElement>(SELECTORS.card)
        // An inner re-render: walk up to the card that owns this subtree.
        || node.closest<HTMLElement>(SELECTORS.card)
        // A card body rendered without its container.
        || (node.querySelector(SELECTORS.labelsContainer) ? node : null);
}

function watchCards(mutations: MutationRecord[]) {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (!isHTMLElement(node) || node.dataset.labelsync) {
                return;
            }
            const card = findCard(node);
            if (!card) {
                return;
            }
            // Check card and parent column.
            if (!card.closest(columnsSelector)) {
                log('mutation: card ignored, not inside a watched column', {card, columnsSelector});
                return;
            }
            log('mutation: card in watched column', card);
            void populateIssueCard(card);
        });
    });
}

function getGitLabSettings(settings: SettingsExtended): GitLabSettings | undefined {
    const projectName = location.pathname.split('/').at(5);
    log('gitlab project lookup', {projectName, pathname: location.pathname});
    return settings.gitlab.filter((item) => item.projectName === projectName)[0];
}

function addPRLabels(): void {
    log('addPRLabels: start');
    columnsSelector = getColumnsSelector(settings.prColumns);
    log('addPRLabels: columnsSelector =', columnsSelector || '(empty)');

    if (!columnsSelector) {
        error('no board column matched the configured PR columns', settings.prColumns);
        probeDom();
        throw new Error('Empty columns selector');
    }

    const matchedColumns = document.querySelectorAll<HTMLElement>(columnsSelector);
    log(`addPRLabels: columnsSelector matches ${matchedColumns.length} column(s)`);
    if (!matchedColumns.length) {
        error('columnsSelector matched 0 elements - the :nth-child mapping is likely off', columnsSelector);
        probeDom();
    }

    const board = document.querySelector(SELECTORS.board);
    log('addPRLabels: board element =', board);
    if (!board) {
        error(`board not found (selector "${SELECTORS.board}")`);
        probeDom();
        throw new Error('Invalid board selector');
    }

    if (isLightTheme()) {
        document.body.classList.add(styles.light);
    }

    const gitLabSettings = getGitLabSettings(settings);
    dataFetcher = gitLabSettings
        ? new GitLabFetcher(gitLabSettings.accessToken, gitLabSettings.hostName)
        : new GitHubFetcher(settings.githubAccessToken);
    log('addPRLabels: fetcher =', gitLabSettings ? 'GitLabFetcher' : 'GitHubFetcher');

    if (!dataFetcher.isReady()) {
        console.warn('ACCESS TOKEN IS NOT SET');
        return;
    }

    const observer = new MutationObserver(watchCards);
    observer.observe(board, {
        childList: true,
        subtree: true,
    });
    log('addPRLabels: mutation observer attached to board');

    let cardCount = 0;
    matchedColumns.forEach((column, index) => {
        const cards = column.querySelectorAll<HTMLElement>(SELECTORS.card);
        log(`addPRLabels: column #${index} holds ${cards.length} card(s)`, column);
        cards.forEach((card) => {
            cardCount += 1;
            void populateIssueCard(card);
        });
    });
    log(`addPRLabels: done, ${cardCount} card(s) processed on the initial pass`);
    if (!cardCount) {
        error(`no cards found inside the matched columns (card selector "${SELECTORS.card}")`);
        probeDom();
    }
}
