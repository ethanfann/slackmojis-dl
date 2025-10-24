import https from "node:https";
import { createRequire } from "node:module";
import type { AxiosInstance, AxiosRequestConfig, AxiosStatic } from "axios";
import axios from "axios";

const require = createRequire(import.meta.url);
const pkg = require("../../../package.json") as { version?: string };

const JSON_BASE_URL = "https://slackmojis.com";
const STREAM_BASE_URL = "https://emojis.slackmojis.com";

type SlackmojiClients = {
	json: AxiosInstance;
	stream: AxiosInstance;
};

let clients: SlackmojiClients | undefined;

const buildClients = (): SlackmojiClients => {
	const agent = new https.Agent({ keepAlive: true });
	const baseHeaders = { "User-Agent": `slackmojis-dl/${pkg.version ?? "dev"}` };
	const axiosClient = axios as unknown as AxiosStatic;
	const create = (baseURL: string, extra: AxiosRequestConfig = {}) =>
		axiosClient.create({
			baseURL,
			httpsAgent: agent,
			timeout: 30_000,
			headers: { ...baseHeaders, ...(extra.headers ?? {}) },
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

const ensureClients = (): SlackmojiClients => {
	if (!clients) {
		clients = buildClients();
	}

	return clients;
};

const getJsonClient = (): AxiosInstance => ensureClients().json;
const getStreamClient = (): AxiosInstance => ensureClients().stream;

export { getJsonClient, getStreamClient };
