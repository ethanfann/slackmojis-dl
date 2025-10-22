const resolvePageCount = (limit, lastPage) => {
	const hasLimit = limit !== undefined && limit !== null;
	const parsedLimit = Number(limit);
	const hasValidLimit = hasLimit && Number.isFinite(parsedLimit);

	if (hasValidLimit) {
		if (parsedLimit <= 0) {
			return 0;
		}

		const limitPages = Math.floor(parsedLimit);

		if (Number.isFinite(lastPage) && lastPage >= 0) {
			const totalPages = Math.floor(lastPage) + 1;
			return Math.min(limitPages, totalPages);
		}

		return limitPages;
	}

	if (!Number.isFinite(lastPage) || lastPage < 0) {
		throw new Error("lastPage must be a non-negative number");
	}

	return Math.floor(lastPage) + 1;
};

module.exports = { resolvePageCount };
