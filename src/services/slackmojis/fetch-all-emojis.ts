import type { SlackmojiEntry } from "../../types/slackmoji.js";
import { fetchAllPageConcurrency } from "./config.js";
import { fetchPage } from "./fetch-page.js";

const DEFAULT_PAGE_CONCURRENCY = fetchAllPageConcurrency;

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
	// Retained for callers, but a stale hint must never cap the listing.
	lastPageHint?: number | null;
	concurrency?: number;
	signal?: AbortSignal;
};

const fetchAllEmojis = async ({
	limit,
	concurrency = DEFAULT_PAGE_CONCURRENCY,
	signal,
}: FetchAllEmojisOptions): Promise<SlackmojiEntry[]> => {
	const maxPages = sanitizeLimit(limit);
	signal?.throwIfAborted();
	if (maxPages === 0) {
		return [];
	}

	const safeConcurrency =
		Number.isFinite(concurrency) && concurrency > 0
			? Math.max(1, Math.floor(concurrency))
			: DEFAULT_PAGE_CONCURRENCY;

	const pages: SlackmojiEntry[][] = [];
	let cursor = 0;
	let discoveredEnd: number | null = null;
	let failed = false;

	const workers = Array.from(
		{
			length:
				maxPages !== null
					? Math.min(safeConcurrency, maxPages)
					: safeConcurrency,
		},
		async () => {
			while (!failed) {
				signal?.throwIfAborted();
				if (discoveredEnd !== null && cursor >= discoveredEnd) {
					break;
				}

				if (maxPages !== null && cursor >= maxPages) {
					break;
				}

				const pageIndex = cursor;
				cursor += 1;

				let normalized: SlackmojiEntry[];
				try {
					normalized = await fetchPage(pageIndex, signal);
				} catch (error) {
					failed = true;
					throw error;
				}

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

	const outcomes = await Promise.allSettled(workers);
	const failure = outcomes.find((outcome) => outcome.status === "rejected");
	if (failure?.status === "rejected") throw failure.reason;
	signal?.throwIfAborted();

	const effectiveEnd =
		discoveredEnd !== null
			? discoveredEnd
			: maxPages !== null
				? maxPages
				: pages.length;

	return pages.slice(0, effectiveEnd).filter(Boolean).flat();
};

export { fetchAllEmojis };
export type { FetchAllEmojisOptions };
