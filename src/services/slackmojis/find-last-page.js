import { fetchPage } from "./fetch-page.js";

const memoizedFetch = () => {
	const cache = new Map();

	return async (page) => {
		if (cache.has(page)) {
			return cache.get(page);
		}

		const results = await fetchPage(page);
		const normalized = Array.isArray(results) ? results : [];
		cache.set(page, normalized);
		return normalized;
	};
};

const findLastPage = async ({ floor = 0 } = {}) => {
	const fetch = memoizedFetch();

	const ensureFirstPageExists = async () => {
		const firstPage = await fetch(0);
		if (firstPage.length === 0) {
			throw new Error("Emoji listing appears to be empty.");
		}
	};

	const expandSearchRange = async () => {
		let lowerBound = 0;
		let upperBound = 1;

		await ensureFirstPageExists();

		const normalizedFloor = Number.isFinite(floor) && floor >= 0 ? Math.floor(floor) : 0;
		if (normalizedFloor > 0) {
			let candidate = normalizedFloor;
			while (candidate > 0) {
				const floorResults = await fetch(candidate);
				if (floorResults.length > 0) {
					lowerBound = candidate;
					upperBound = candidate + 1;
					break;
				}
				candidate = Math.floor(candidate / 2);
			}
		}

		let results = await fetch(upperBound);

		while (results.length > 0) {
			lowerBound = upperBound;
			upperBound *= 2;
			results = await fetch(upperBound);
		}

		return { lowerBound, upperBound };
	};

	const binarySearch = async ({ lowerBound, upperBound }) => {
		let lastNonEmpty = lowerBound;
		let low = lowerBound;
		let high = upperBound;

		while (low + 1 < high) {
			const midpoint = Math.floor((low + high) / 2);
			const midResults = await fetch(midpoint);

			if (midResults.length > 0) {
				lastNonEmpty = midpoint;
				low = midpoint;
			} else {
				high = midpoint;
			}
		}

		return lastNonEmpty;
	};

	try {
		const range = await expandSearchRange();
		return binarySearch(range);
	} catch (error) {
		const wrapped = new Error("Unable to determine last emoji page.");
		wrapped.cause = error;
		throw wrapped;
	}
};

export { findLastPage };
