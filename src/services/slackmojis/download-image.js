import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { getStreamClient } from "./client.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

const toRelativePath = (inputUrl) => {
	try {
		const parsed = new URL(inputUrl);
		return `${parsed.pathname}${parsed.search || ""}`;
	} catch {
		return inputUrl.startsWith("/") ? inputUrl : `/${inputUrl}`;
	}
};

const removePartialFile = async (filePath) => {
	try {
		await fs.promises.unlink(filePath);
	} catch (error) {
		if (!error || error.code !== "ENOENT") {
			// best effort cleanup; ignore other errors
		}
	}
};

const downloadImage = async (url, destination, options = {}) => {
	const client = getStreamClient();
	const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

	let attempt = 0;
	let lastError = null;

	while (attempt <= maxRetries) {
		try {
			const response = await client.get(toRelativePath(url));
			await pipeline(response.data, fs.createWriteStream(destination));
			return destination;
		} catch (error) {
			lastError = error;
			await removePartialFile(destination);
			attempt += 1;

			if (attempt > maxRetries) {
				break;
			}

			await wait(retryDelayMs * attempt);
		}
	}

	const failure = new Error(
		`Failed to download ${url} after ${maxRetries + 1} attempts.`,
	);
	failure.cause = lastError;
	throw failure;
};

export { downloadImage };
