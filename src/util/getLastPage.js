const getPage = require("./getPage");

const getLastPage = async () => {
	const pageCache = new Map();

	const fetchPage = async (page) => {
		if (pageCache.has(page)) {
			return pageCache.get(page);
		}

		const results = await getPage(page);
		const normalized = Array.isArray(results) ? results : [];
		pageCache.set(page, normalized);
		return normalized;
	};

	const ensureFirstPageExists = async () => {
		const firstPageResults = await fetchPage(0);
		if (firstPageResults.length === 0) {
			throw new Error("Emoji listing appears to be empty.");
		}
	};

	const expandSearchRange = async () => {
		let lowerBound = 0;
		let upperBound = 1;

		await ensureFirstPageExists();

		let results = await fetchPage(upperBound);

		while (results.length > 0) {
			lowerBound = upperBound;
			upperBound *= 2;
			results = await fetchPage(upperBound);
		}

		return { lowerBound, upperBound };
	};

	const binarySearchForLast = async ({ lowerBound, upperBound }) => {
		let lastNonEmpty = lowerBound;
		let low = lowerBound;
		let high = upperBound;

		while (low + 1 < high) {
			const midpoint = Math.floor((low + high) / 2);
			const midResults = await fetchPage(midpoint);

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
		const lastPage = await binarySearchForLast(range);
		return lastPage;
	} catch (error) {
		const wrappedError = new Error("Unable to determine last emoji page.");
		wrappedError.cause = error;
		throw wrappedError;
	}
};

module.exports = getLastPage;
