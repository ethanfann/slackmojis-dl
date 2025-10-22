import { fetchPage } from "./fetch-page.js";
import { MIN_LAST_PAGE_INDEX } from "./last-page-hint.js";

const DEFAULT_PAGE_CONCURRENCY = 10;

const sanitizeLimit = (limit) => {
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

const fetchAllEmojis = async ({
	limit,
	lastPageHint,
	concurrency = DEFAULT_PAGE_CONCURRENCY,
}) => {
	const maxPages = sanitizeLimit(limit);
	const effectiveLimit =
		maxPages !== null
			? maxPages
			: Number.isFinite(lastPageHint) && lastPageHint >= 0
				? Math.floor(lastPageHint) + 1
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

	const pages = [];
	let cursor = 0;
	let discoveredEnd = null;

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

				const pageResults = await fetchPage(pageIndex);
				const normalized = Array.isArray(pageResults) ? pageResults : [];

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
