import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { setTimeout as wait } from "node:timers/promises";
import { getStreamClient } from "./client.js";
import { slackmojisDownloadConfig } from "./config.js";

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
	signal?: AbortSignal;
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
		options.signal?.throwIfAborted();
		const partialPath = path.join(
			path.dirname(destination),
			`.slackmojis-${randomUUID()}.part`,
		);
		try {
			const response = await client.get(url, {
				signal: options.signal,
			});
			await pipeline(
				response.data,
				fs.createWriteStream(partialPath, { flags: "wx" }),
				{ signal: options.signal },
			);
			if ((await fs.promises.stat(partialPath)).size === 0) {
				throw new Error("Received an empty image response.");
			}
			options.signal?.throwIfAborted();
			// Publish only complete files; unlike rename, link never overwrites a
			// destination created by another run (or follows a destination symlink).
			await fs.promises.link(partialPath, destination);
			return destination;
		} catch (error) {
			lastError = error;
			options.signal?.throwIfAborted();
			attempt += 1;

			if (
				attempt > maxRetries ||
				(isNodeError(error) && error.code === "EEXIST")
			) {
				break;
			}
		} finally {
			await removePartialFile(partialPath);
		}

		const delayMs = calculateBackoffDelay(retryDelayMs, attempt);
		await wait(delayMs, undefined, { signal: options.signal });
	}

	throw new Error(`Failed to download ${url} after ${attempt} attempts.`, {
		cause: lastError,
	});
};

export { downloadImage };
export type { DownloadOptions };
