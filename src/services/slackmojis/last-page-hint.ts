import https from "node:https";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HINT_URL =
	"https://raw.githubusercontent.com/ethanfann/slackmojis-dl/main/data/lastPage.json";
const MIN_LAST_PAGE_INDEX = 199;

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type LastPagePayload = {
	lastPage?: number;
	updatedAt?: string;
	[key: string]: unknown;
};

let localSnapshot: number | null = null;
try {
	const data = require(
		path.join(__dirname, "../../../data/lastPage.json"),
	) as LastPagePayload;
	const value = data?.lastPage;
	if (Number.isFinite(value) && (value as number) >= 0) {
		localSnapshot = Math.floor(value as number);
	}
} catch {
	localSnapshot = null;
}

const fetchJson = <T = unknown>(url: string): Promise<T> =>
	new Promise<T>((resolve, reject) => {
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
						const parsed = JSON.parse(raw) as T;
						resolve(parsed);
					} catch (error) {
						reject(error);
					}
				});
			})
			.on("error", reject);
	});

const resolveLastPageHint = async (): Promise<number> => {
	const snapshotValue = localSnapshot;
	let best =
		Number.isFinite(snapshotValue) && (snapshotValue as number) >= 0
			? Math.floor(snapshotValue as number)
			: null;

	try {
		const payload = await fetchJson<LastPagePayload>(HINT_URL);
		const value = payload?.lastPage;
		if (Number.isFinite(value) && (value as number) >= 0) {
			const normalized = Math.floor(value as number);
			best = best === null ? normalized : Math.max(best, normalized);
		}
	} catch {
		// ignore network/parse failures
	}

	if (best === null) {
		return MIN_LAST_PAGE_INDEX;
	}

	return Math.max(best, MIN_LAST_PAGE_INDEX);
};

export { resolveLastPageHint, MIN_LAST_PAGE_INDEX };
