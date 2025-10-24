import type { SlackmojiEntry } from "../../types/slackmoji.js";
import { fetchPage } from "./fetch-page.js";
import { MIN_LAST_PAGE_INDEX } from "./last-page-hint.js";

const DEFAULT_PAGE_CONCURRENCY = 10;

const sanitizeLimit = (limit: unknown): number | null => {
	if (limit === undefined || limit === null) {
		return null;
	}

	const parsed = Number(limit);
	if (!Number.isFinite(parsed)) {
		return null;
	}

	if (parsed <= 0) {
		return 0;
	}

	return Math.floor(parsed);
};

type FetchAllEmojisOptions = {
	limit?: number | null;
	lastPageHint?: number | null;
	concurrency?: number;
};

const fetchAllEmojis = async ({
	limit,
	lastPageHint,
	concurrency = DEFAULT_PAGE_CONCURRENCY,
}: FetchAllEmojisOptions): Promise<SlackmojiEntry[]> => {
	const maxPages = sanitizeLimit(limit);
	const effectiveLimit =
		maxPages !== null
			? maxPages
			: Number.isFinite(lastPageHint) && (lastPageHint as number) >= 0
				? Math.floor(lastPageHint as number) + 1
				: null;
	const clampedLimit =
		effectiveLimit !== null
			? Math.max(effectiveLimit, MIN_LAST_PAGE_INDEX + 1)
			: null;
	if (maxPages === 0) {
		return [];
	}

	const safeConcurrency =
		Number.isFinite(concurrency) && concurrency > 0
			? Math.floor(concurrency)
			: DEFAULT_PAGE_CONCURRENCY;

	const pages: SlackmojiEntry[][] = [];
	let cursor = 0;
	let discoveredEnd: number | null = null;

	const workers = Array.from(
		{
			length:
				clampedLimit !== null
					? Math.min(safeConcurrency, clampedLimit)
					: safeConcurrency,
		},
		async () => {
			while (true) {
				if (discoveredEnd !== null && cursor >= discoveredEnd) {
					break;
				}

				if (maxPages !== null && cursor >= maxPages) {
					break;
				}

				if (clampedLimit !== null && cursor >= clampedLimit) {
					break;
				}

				const pageIndex = cursor;
				cursor += 1;

				const normalized = await fetchPage(pageIndex);

				if (normalized.length === 0) {
					if (discoveredEnd === null || pageIndex < discoveredEnd) {
						discoveredEnd = pageIndex;
					}
					break;
				}

				pages[pageIndex] = normalized;
			}
		},
	);

	await Promise.all(workers);

	const effectiveEnd =
		discoveredEnd !== null
			? discoveredEnd
			: maxPages !== null
				? maxPages
				: clampedLimit !== null
					? clampedLimit
					: pages.length;

	return pages.slice(0, effectiveEnd).filter(Boolean).flat();
};

export { fetchAllEmojis };
export type { FetchAllEmojisOptions };
