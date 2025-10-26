import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { getStreamClient } from "./client.js";
import { slackmojisDownloadConfig } from "./config.js";

const wait = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const toRelativePath = (inputUrl: string): string => {
	try {
		const parsed = new URL(inputUrl);
		return `${parsed.pathname}${parsed.search || ""}`;
	} catch {
		return inputUrl.startsWith("/") ? inputUrl : `/${inputUrl}`;
	}
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
	error !== null && typeof error === "object" && "code" in error;

const removePartialFile = async (filePath: string): Promise<void> => {
	try {
		await fs.promises.unlink(filePath);
	} catch (error) {
		if (!isNodeError(error) || error.code !== "ENOENT") {
			// best effort cleanup; ignore other errors
		}
	}
};

type DownloadOptions = {
	maxRetries?: number;
	retryDelayMs?: number;
};

const calculateBackoffDelay = (
	baseDelayMs: number,
	attempt: number,
): number => {
	const exponent = Math.max(0, attempt - 1);
	const normalizedMultiplier = Math.max(
		1,
		slackmojisDownloadConfig.backoffMultiplier,
	);
	const rawDelay = baseDelayMs * normalizedMultiplier ** exponent;
	const maxDelay = Math.max(baseDelayMs, slackmojisDownloadConfig.maxDelayMs);
	const exponentialDelay = Math.min(rawDelay, maxDelay);
	const normalizedJitterRatio = Math.min(
		1,
		Math.max(0, slackmojisDownloadConfig.jitterRatio),
	);
	const jitterWindow = exponentialDelay * normalizedJitterRatio;
	const minDelay = exponentialDelay - jitterWindow;
	const jitteredDelay = minDelay + Math.random() * jitterWindow;
	return Math.max(1, jitteredDelay);
};

const downloadImage = async (
	url: string,
	destination: string,
	options: DownloadOptions = {},
): Promise<string> => {
	const client = getStreamClient();
	const maxRetries = options.maxRetries ?? slackmojisDownloadConfig.maxRetries;
	const retryDelayMs =
		options.retryDelayMs ?? slackmojisDownloadConfig.retryDelayMs;

	let attempt = 0;
	let lastError: unknown = null;

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

			const delayMs = calculateBackoffDelay(retryDelayMs, attempt);
			await wait(delayMs);
		}
	}

	throw new Error(
		`Failed to download ${url} after ${maxRetries + 1} attempts.`,
		{ cause: lastError },
	);
};

export { downloadImage };
export type { DownloadOptions };
