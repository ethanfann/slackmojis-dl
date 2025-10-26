import { createRequire } from "node:module";
import type { Readable } from "node:stream";
import {
	Agent,
	type Dispatcher,
	getGlobalDispatcher,
	request as undiciRequest,
} from "undici";

const require = createRequire(import.meta.url);
const pkg = require("../../../package.json") as { version?: string };

const JSON_BASE_URL = "https://slackmojis.com";
const STREAM_BASE_URL = "https://emojis.slackmojis.com";
const REQUEST_TIMEOUT_MS = 30_000;

type QueryParams = Record<string, string | number | boolean | null | undefined>;

type RequestConfig = {
	headers?: Record<string, string>;
	params?: QueryParams;
	timeoutMs?: number;
};

type HttpResponse<T> = {
	data: T;
	statusCode: number;
};

type JsonClient = {
	get<T>(path: string, config?: RequestConfig): Promise<HttpResponse<T>>;
};

type StreamClient = {
	get(path: string, config?: RequestConfig): Promise<HttpResponse<Readable>>;
};

type SlackmojiClients = {
	json: JsonClient;
	stream: StreamClient;
};

let clients: SlackmojiClients | undefined;

const baseHeaders = Object.freeze({
	"User-Agent": `slackmojis-dl/${pkg.version ?? "dev"}`,
	"Accept-Encoding": "identity",
});

let fallbackAgent: Agent | undefined;

const getDispatcher = (): Dispatcher => {
	const globalDispatcher = getGlobalDispatcher();
	if (globalDispatcher) {
		return globalDispatcher;
	}

	if (!fallbackAgent) {
		fallbackAgent = new Agent({
			connectTimeout: REQUEST_TIMEOUT_MS,
		});
	}

	return fallbackAgent;
};

const buildUrl = (path: string, baseUrl: string, params?: QueryParams): URL => {
	const url = new URL(path, baseUrl);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === null) {
				continue;
			}
			url.searchParams.set(key, String(value));
		}
	}
	return url;
};

type ResponseBody = Dispatcher.ResponseData["body"];

const readBodyText = async (body: ResponseBody): Promise<string> => {
	try {
		return await body.text();
	} catch (error) {
		body.destroy(error instanceof Error ? error : new Error(String(error)));
		throw error;
	}
};

const discardBody = async (body: ResponseBody): Promise<void> => {
	try {
		for await (const _chunk of body) {
			// drain
		}
	} catch {
		body.destroy();
	}
};

const dispatchJson = async <T>(
	path: string,
	config: RequestConfig | undefined,
): Promise<HttpResponse<T>> => {
	const dispatcher = getDispatcher();
	const url = buildUrl(path, JSON_BASE_URL, config?.params);
	const headers = {
		...baseHeaders,
		Accept: "application/json",
		...(config?.headers ?? {}),
	};
	const timeout = config?.timeoutMs ?? REQUEST_TIMEOUT_MS;

	const response = await undiciRequest(url, {
		method: "GET",
		headers,
		bodyTimeout: timeout,
		headersTimeout: timeout,
		dispatcher,
	});

	const { statusCode, body } = response;
	if (statusCode < 200 || statusCode >= 300) {
		await discardBody(body);
		throw new Error(
			`Request to ${url.pathname}${url.search} failed with status ${statusCode}`,
		);
	}

	const payload = await readBodyText(body);
	const data = (payload ? JSON.parse(payload) : null) as T;
	return { data, statusCode };
};

const dispatchStream = async (
	path: string,
	config: RequestConfig | undefined,
): Promise<HttpResponse<Readable>> => {
	const dispatcher = getDispatcher();
	const url = buildUrl(path, STREAM_BASE_URL, config?.params);
	const headers = {
		...baseHeaders,
		Accept: "*/*",
		...(config?.headers ?? {}),
	};
	const timeout = config?.timeoutMs ?? REQUEST_TIMEOUT_MS;

	const response = await undiciRequest(url, {
		method: "GET",
		headers,
		bodyTimeout: timeout,
		headersTimeout: timeout,
		dispatcher,
	});

	const { statusCode, body } = response;
	if (statusCode < 200 || statusCode >= 300) {
		await discardBody(body);
		throw new Error(
			`Stream request to ${url.pathname}${url.search} failed with status ${statusCode}`,
		);
	}

	return { data: body as unknown as Readable, statusCode };
};

const buildClients = (): SlackmojiClients => {
	const json: JsonClient = {
		get: (path, config) => dispatchJson(path, config),
	};
	const stream: StreamClient = {
		get: (path, config) => dispatchStream(path, config),
	};

	return {
		json,
		stream,
	};
};

const ensureClients = (): SlackmojiClients => {
	if (!clients) {
		clients = buildClients();
	}

	return clients;
};

const getJsonClient = (): JsonClient => ensureClients().json;
const getStreamClient = (): StreamClient => ensureClients().stream;

export { getJsonClient, getStreamClient };
