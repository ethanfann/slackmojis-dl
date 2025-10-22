const { fetchPage } = require("./fetchPage");
const { resolvePageCount } = require("./resolvePageCount");

const DEFAULT_PAGE_CONCURRENCY = 10;

const fetchAllEmojis = async ({ limit, lastPage, concurrency = DEFAULT_PAGE_CONCURRENCY }) => {
	const pageTotal = resolvePageCount(limit, lastPage);
	if (pageTotal === 0) return [];

	const results = new Array(pageTotal);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, pageTotal) }, async () => {
		while (cursor < pageTotal) {
			const current = cursor;
			cursor += 1;
			// eslint-disable-next-line no-await-in-loop
			results[current] = await fetchPage(current);
		}
	});

	await Promise.all(workers);
	return results.flat();
};

module.exports = { fetchAllEmojis };
