const resolvePageCount = (limit, lastPage) => {
	if (!Number.isFinite(lastPage) || lastPage < 0) {
		throw new Error("lastPage must be a non-negative number");
	}

	const totalPages = Math.floor(lastPage) + 1;

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

module.exports = { resolvePageCount };
