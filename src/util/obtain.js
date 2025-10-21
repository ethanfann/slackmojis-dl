const getPage = require("./getPage");
const { mapWithConcurrency } = require("./concurrency");

const DEFAULT_PAGE_CONCURRENCY = 10;

const resolvePageCount = (limit, lastPage) => {
	if (lastPage < 0) {
		throw new Error("lastPage must be a non-negative number");
	}

	const totalPages = lastPage + 1;

	if (limit === undefined || limit === null) {
		return totalPages;
	}

	const parsedLimit = Number(limit);

	if (!Number.isFinite(parsedLimit)) {
		return totalPages;
	}

	if (parsedLimit <= 0) {
		return 0;
	}

	if (parsedLimit >= totalPages) {
		return totalPages;
	}

	return Math.floor(parsedLimit);
};

const getEntireList = async (limit, lastPage) => {
	const pageCount = resolvePageCount(limit, lastPage);
	if (pageCount === 0) {
		return [];
	}
	const pages = Array.from(
		{ length: pageCount },
		(_, pageNumber) => pageNumber,
	);

	const pageResults = await mapWithConcurrency(
		pages,
		DEFAULT_PAGE_CONCURRENCY,
		async (page) => {
			const results = await getPage(page);
			return results;
		},
	);

	return pageResults.flat();
};

const obtain = async (limit, lastPage) => {
	try {
		const results = await getEntireList(limit, lastPage);
		return results;
	} catch (error) {
		const wrappedError = new Error("Unable to obtain Emoji Listing.");
		wrappedError.cause = error;
		throw wrappedError;
	}
};

module.exports = obtain;
