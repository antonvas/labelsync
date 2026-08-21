import {
    DataFetcher, LabelData, PullRequestDetailsData, RequestDetailsData, ReviewerData, UserData,
} from '@/types.ts';
import { fetchData, fetchJiraRest } from '@/utils/utils.ts';
import { log, warn } from '@/utils/debug.ts';

type JiraCardData = {
    id: string
}

type JiraIssueDetailData = {
    detail?: {pullRequests?: RequestDetailsData[]}[]
}

type JiraDevSummaryData = {
    summary?: {
        pullrequest?: {
            byInstanceType?: Record<string, { count: number }>
        }
    }
}

type GitHubDetails = {
    user: UserData
    requested_reviewers: UserData[]
    labels: LabelData[]
}

type GitHubReview = {
    user: UserData
    state: string
}

export default class GitHubFetcher implements DataFetcher {
    private readonly accessToken: string = '';

    // The GitHub integration is site-wide, so its applicationType is the same for
    // every card. Discover it once and reuse it across all cards.
    private applicationType?: string;

    private discovery?: Promise<string | undefined>;

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    isReady() {
        return !!this.accessToken;
    }

    private getHeaders() {
        return new Headers({
            Authorization: `token ${this.accessToken}`,
        });
    }

    private async fetchApplicationType(issueId: string): Promise<string | undefined> {
        const { summary } = await fetchJiraRest<JiraDevSummaryData>(
            `/dev-status/latest/issue/summary?issueId=${issueId}`,
        );
        return Object.keys(summary?.pullrequest?.byInstanceType || {})[0];
    }

    private async getApplicationType(issueId: string): Promise<string | undefined> {
        if (this.applicationType) {
            return this.applicationType;
        }
        // Collapse the initial burst of cards into a single summary request.
        if (!this.discovery) {
            this.discovery = this.fetchApplicationType(issueId);
        }
        let applicationType = await this.discovery;
        if (!applicationType) {
            // The seed issue had no PRs, so it revealed nothing. Retry with this issue.
            this.discovery = undefined;
            applicationType = await this.fetchApplicationType(issueId);
        }
        if (applicationType) {
            this.applicationType = applicationType;
        }
        return applicationType;
    }

    async getRequestsList(cardKey: string): Promise<RequestDetailsData[]> {
        log('getRequestsList: cardKey =', cardKey);
        const { id } = await fetchJiraRest<JiraCardData>(`/api/3/issue/${cardKey}?fields=id`);
        log('getRequestsList: issue id =', id, 'for', cardKey);

        const applicationType = await this.getApplicationType(id);
        log('getRequestsList: applicationType =', applicationType, 'for', cardKey);
        if (!applicationType) {
            warn('no applicationType - Jira reports no linked PRs for', cardKey);
            return [];
        }

        const { detail } = await fetchJiraRest<JiraIssueDetailData>(
            `/dev-status/latest/issue/detail?issueId=${id}&applicationType=${applicationType}&dataType=pullrequest`,
        );

        const requests = detail?.[0]?.pullRequests?.map((item) => ({
            ...item,
            id: item.id.replace('#', ''),
        })) || [];
        log(`getRequestsList: ${requests.length} PR(s) for ${cardKey}`, requests);
        return requests;
    }

    async getRequestDetails(requestData: RequestDetailsData): Promise<PullRequestDetailsData> {
        const data = await fetchData<GitHubDetails>(
            `https://api.github.com/repos/${requestData.repositoryName}/pulls/${requestData.id}`,
            { headers: this.getHeaders() },
        );

        return {
            author: data.user,
            requestedReviewers: data.requested_reviewers,
            labels: data.labels.map((label) => ({ ...label, color: `#${label.color}` })),
        };
    }

    async getRequestReviewers(requestData:RequestDetailsData, prData: PullRequestDetailsData): Promise<ReviewerData[]> {
        const reviews = await fetchData<GitHubReview[]>(
            `https://api.github.com/repos/${requestData.repositoryName}/pulls/${requestData.id}/reviews?per_page=100`,
            { headers: this.getHeaders() },
        );

        const { author, requestedReviewers } = prData;
        const reviewers: Record<string, ReviewerData> = {
            ...requestedReviewers.reduce((prev, user) => ({ ...prev, [user.login]: { state: 'PENDING', ...user } }), {}),
            ...reviews.reduce((prev, { user, state }) => ({ ...prev, [user.login]: { state, ...user } }), {}),
        };

        return Object.values(reviewers).filter((reviewer) => reviewer.login !== author.login);
    }
}
