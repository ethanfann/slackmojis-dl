const https = require("node:https");

const HINT_URL =
	"https://raw.githubusercontent.com/ethanfann/slackmojis-dl/main/data/lastPage.json";

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
	try {
		const payload = await fetchJson(HINT_URL);
		const value = payload?.lastPage;
		if (Number.isFinite(value) && value >= 0) {
			return Math.floor(value);
		}
	} catch {
		// ignore network/parse failures; caller will fall back
	}

	return null;
};

module.exports = { resolveLastPageHint };
