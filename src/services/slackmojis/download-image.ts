import fs from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getStreamClient } from "./client.js";

const wait = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

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

const downloadImage = async (
	url: string,
	destination: string,
	options: DownloadOptions = {},
): Promise<string> => {
	const client = getStreamClient();
	const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
	const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

	let attempt = 0;
	let lastError: unknown = null;

	while (attempt <= maxRetries) {
		try {
			const response = await client.get<Readable>(toRelativePath(url));
			await pipeline(
				response.data as Readable,
				fs.createWriteStream(destination),
			);
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

	throw new Error(
		`Failed to download ${url} after ${maxRetries + 1} attempts.`,
		{ cause: lastError },
	);
};

export { downloadImage };
export type { DownloadOptions };
