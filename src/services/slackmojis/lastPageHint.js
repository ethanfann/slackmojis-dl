const https = require("node:https");
const path = require("node:path");

const HINT_URL =
	"https://raw.githubusercontent.com/ethanfann/slackmojis-dl/main/data/lastPage.json";
const MIN_LAST_PAGE_INDEX = 199;

let localSnapshot = null;
try {
	// eslint-disable-next-line global-require, import/no-dynamic-require
	const data = require(path.join(__dirname, "../../../data/lastPage.json"));
	if (Number.isFinite(data?.lastPage) && data.lastPage >= 0) {
		localSnapshot = Math.floor(data.lastPage);
	}
} catch {
	localSnapshot = null;
}

const fetchJson = (url) =>
	new Promise((resolve, reject) => {
		https
			.get(url, (response) => {
				if (response.statusCode !== 200) {
					reject(new Error(`Unexpected status code ${response.statusCode}`));
					response.resume();
					return;
				}

				let raw = "";
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					raw += chunk;
				});
				response.on("end", () => {
					try {
						const parsed = JSON.parse(raw);
						resolve(parsed);
					} catch (error) {
						reject(error);
					}
				});
			})
			.on("error", reject);
	});

const resolveLastPageHint = async () => {
	let best = Number.isFinite(localSnapshot) && localSnapshot >= 0 ? localSnapshot : null;

	try {
		const payload = await fetchJson(HINT_URL);
		const value = payload?.lastPage;
		if (Number.isFinite(value) && value >= 0) {
			best = best === null ? Math.floor(value) : Math.max(best, Math.floor(value));
		}
	} catch {
		// ignore network/parse failures
	}

	if (best === null) {
		return MIN_LAST_PAGE_INDEX;
	}

	return Math.max(best, MIN_LAST_PAGE_INDEX);
};

module.exports = { resolveLastPageHint, MIN_LAST_PAGE_INDEX };
