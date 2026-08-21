import { Settings } from '@/types.ts';

export const INITIAL_SETTINGS: Settings = {
    codeReviewersLabels: 'In Code Review, Ready for Code Review',
    githubAccessToken: '',
    gitlab: [{
        accessToken: '',
        projectName: '',
        hostName: '',
    }],
    hideLabelsOnClosedPRs: true,
    hideClosedPRs: false,
    prColumns: 'In Review, Done',
    ffCodeReviewers: false,
    ffShortName: true,
    ffCompactReviewers: true,
};

export const SELECTORS = {
    board: '[data-test-id="software-board.board-area"]',
    column: '[data-component-selector="platform-board-kit.ui.column.draggable-column"]',
    columnHeader: '[data-component-selector="platform-board-kit.ui.column-title"]',
    card: '[data-component-selector="platform-board-kit.ui.card-container"]',
    // The card body is a stack of content sections; the footer (key, dev-info
    // icon, priority, assignee) is the last one, and we slot in just above it.
    // Anchored on data attributes because the classes are Compiled atomic hashes.
    labelsContainer: '[data-testid="platform-card.ui.card.card-content.footer"]',
    contentSection: '[data-component-selector="platform-card.ui.card.card-content.content-section"]',
    cardKey: '[data-testid="platform-card.common.ui.key.key"]',
} as const;
