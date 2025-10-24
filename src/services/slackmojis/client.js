import https from "node:https";
import { createRequire } from "node:module";
import axios from "axios";

const require = createRequire(import.meta.url);
const pkg = require("../../../package.json");

const JSON_BASE_URL = "https://slackmojis.com";
const STREAM_BASE_URL = "https://emojis.slackmojis.com";

let clients;

const buildClients = () => {
	const agent = new https.Agent({ keepAlive: true });
	const baseHeaders = { "User-Agent": `slackmojis-dl/${pkg.version}` };
	const create = (baseURL, extra = {}) =>
		axios.create({
			baseURL,
			httpsAgent: agent,
			timeout: 30_000,
			headers: { ...baseHeaders, ...extra.headers },
			...extra,
		});

	return {
		json: create(JSON_BASE_URL),
		stream: create(STREAM_BASE_URL, {
			headers: { "Content-Type": "application/json" },
			responseType: "stream",
		}),
	};
};

const ensureClients = () => {
	if (!clients) {
		clients = buildClients();
	}

	return clients;
};

const getJsonClient = () => ensureClients().json;
const getStreamClient = () => ensureClients().stream;

export { getJsonClient, getStreamClient };
