const path = require("node:path");
const fsPromises = require("node:fs/promises");
const { performance } = require("node:perf_hooks");
const { createTaskQueue } = require("../lib/taskQueue");
const { buildDownloadTargets } = require("../emoji/buildDownloadTargets");
const { listEmojiEntries } = require("../services/filesystem/emojiInventory");
const { fetchPage, downloadImage } = require("../services/slackmojis");

const DEFAULT_DOWNLOAD_CONCURRENCY = 200;
const DEFAULT_PAGE_CONCURRENCY = 8;

const normalizeKey = (category, name) => path.join(category, name);

const buildFileName = (originalName, attempt) => {
	if (attempt === 0) {
		return originalName;
	}

	const parsed = path.parse(originalName);
	return `${parsed.name}-${attempt}${parsed.ext}`;
};

const formatErrorMessage = (error) => {
	if (!error) return "Unknown error";
	const baseMessage = error.message || "Unknown error";
	const causeMessage = error.cause?.message;
	return causeMessage ? `${baseMessage}: ${causeMessage}` : baseMessage;
};

const createEmojiPipeline = ({
	dest,
	limit,
	category,
	onEvent,
	downloadConcurrency = DEFAULT_DOWNLOAD_CONCURRENCY,
	pageConcurrency = DEFAULT_PAGE_CONCURRENCY,
}) => {
	const abortController = new AbortController();
	const { signal } = abortController;

	const emit = (event) => {
		if (signal.aborted) {
			return;
		}

		if (typeof onEvent === "function") {
			onEvent(event);
		}
	};

	const run = async () => {
		const rootDir = dest === "emojis" ? process.cwd() : dest;
		const outputDir = path.join(rootDir, "emojis");

		await fsPromises.mkdir(outputDir, { recursive: true });

		if (signal.aborted) {
			return;
		}

		const limitProvided = limit !== undefined && limit !== null;
		let maxPages = null;

		if (limitProvided) {
			const parsedLimit = Number(limit);
			if (Number.isFinite(parsedLimit)) {
				if (parsedLimit <= 0) {
					emit({ type: "page-total", total: 0 });
					emit({ type: "status", stage: "complete" });
					return;
				}

				maxPages = Math.floor(parsedLimit);
			}
		}

		emit({ type: "page-total", total: maxPages });

		if (maxPages === 0) {
			emit({ type: "status", stage: "complete" });
			return;
		}

		const existingEntries = listEmojiEntries(outputDir);
		const existingSet = new Set(existingEntries);
		const scheduledKeys = new Set(existingEntries);
		const reservedKeys = new Set();

		let startTime = null;

		const updateElapsed = () => {
			if (startTime === null || signal.aborted) {
				return;
			}

			const elapsedSeconds = (performance.now() - startTime) / 1000;
			emit({ type: "elapsed", seconds: elapsedSeconds });
		};

		const ensureStartTime = () => {
			if (startTime === null) {
				startTime = performance.now();
			}
		};

		const ensuredDirectories = new Set();
		const ensureDir = async (dir) => {
			if (ensuredDirectories.has(dir)) {
				return;
			}

			await fsPromises.mkdir(dir, { recursive: true });
			ensuredDirectories.add(dir);
		};

		const reserveDestination = async (emoji) => {
			await ensureDir(emoji.dest);

			let attempt = 0;
			let fileName;
			let key;

			do {
				fileName = buildFileName(emoji.name, attempt);
				key = normalizeKey(emoji.category, fileName);
				attempt += 1;
			} while (existingSet.has(key) || reservedKeys.has(key));

			reservedKeys.add(key);

			return {
				fileName,
				eventKey: key,
				fullPath: path.join(emoji.dest, fileName),
			};
		};

		const downloadQueue = createTaskQueue(downloadConcurrency, {
			onStatsChange: (stats) => {
				emit({ type: "download-stats", stats });
			},
		});

		const downloadTasks = [];

		const scheduleDownload = (emoji) => {
			if (signal.aborted) {
				return;
			}

			const taskPromise = downloadQueue
				.push(async () => {
					if (signal.aborted) {
						return;
					}

					ensureStartTime();

					const destination = await reserveDestination(emoji);

					if (signal.aborted) {
						reservedKeys.delete(destination.eventKey);
						return;
					}

					try {
						await downloadImage(emoji.url, destination.fullPath, {
							maxRetries: 2,
						});

						if (signal.aborted) {
							return;
						}

						existingSet.add(destination.eventKey);
						reservedKeys.delete(destination.eventKey);

						emit({
							type: "download-success",
							entry: {
								key: destination.eventKey,
								title: `Downloaded ${emoji.dest}/${destination.fileName}`,
							},
						});
					} catch (error) {
						reservedKeys.delete(destination.eventKey);

						if (signal.aborted) {
							return;
						}

						const message = formatErrorMessage(error);
						console.error(`Failed to download ${emoji.url}: ${message}`);

						emit({
							type: "download-error",
							entry: {
								key: destination.eventKey,
								title: `Failed ${emoji.dest}/${destination.fileName}: ${message}`,
							},
							error: message,
						});
					} finally {
						updateElapsed();
					}
				})
				.catch((error) => {
					if (signal.aborted) {
						return;
					}

					const message = formatErrorMessage(error);
					console.error(`Uncaught download error: ${message}`);
					emit({ type: "error", error });
				});

			downloadTasks.push(taskPromise);
		};

		emit({ type: "status", stage: "fetching" });

		const pageQueue = createTaskQueue(pageConcurrency, {
			onStatsChange: (stats) => {
				emit({
					type: "page-stats",
					stats,
				});
			},
		});

		let fetchedPages = 0;
		let nextPageIndex = 0;
		let endReached = false;
		let knownTotal = maxPages;

		const updatePageTotal = (candidate) => {
			if (!Number.isFinite(candidate) || candidate < 0) {
				return;
			}

			const normalized = Math.floor(candidate);
			if (knownTotal === null || normalized < knownTotal) {
				knownTotal = normalized;
				emit({ type: "page-total", total: knownTotal });
			}
		};

		const schedulePageFetch = () => {
			if (signal.aborted) {
				return;
			}

			if (endReached) {
				return;
			}

			if (knownTotal !== null && nextPageIndex >= knownTotal) {
				return;
			}

			const pageIndex = nextPageIndex;
			nextPageIndex += 1;

			pageQueue
				.push(async () => {
					if (signal.aborted) {
						return;
					}

					emit({
						type: "page-progress",
						progress: {
							fetched: fetchedPages,
							current: pageIndex + 1,
						},
					});

					const pageResults = await fetchPage(pageIndex);

					if (signal.aborted) {
						return;
					}

					const normalizedResults = Array.isArray(pageResults)
						? pageResults
						: [];

					if (normalizedResults.length === 0) {
						endReached = true;
						updatePageTotal(pageIndex);
						return;
					}

					const prepared = buildDownloadTargets(
						normalizedResults,
						category,
						outputDir,
					);
					const newDownloads = [];

					for (const emoji of prepared) {
						const key = normalizeKey(emoji.category, emoji.name);
						if (existingSet.has(key) || scheduledKeys.has(key)) {
							continue;
						}

						scheduledKeys.add(key);
						newDownloads.push(emoji);
					}

					if (newDownloads.length > 0) {
						emit({
							type: "downloads-scheduled",
							count: newDownloads.length,
						});
					}

					newDownloads.forEach((emoji) => {
						if (!signal.aborted) {
							scheduleDownload(emoji);
						}
					});

					fetchedPages += 1;

					emit({
						type: "page-progress",
						progress: {
							fetched: fetchedPages,
							current: pageIndex + 1,
						},
					});

					if (!signal.aborted) {
						schedulePageFetch();
					}
				})
				.catch((error) => {
					if (signal.aborted) {
						return;
					}

					const message = formatErrorMessage(error);
					console.error(`Failed to fetch page ${pageIndex}: ${message}`);
					emit({ type: "error", error });
				});
		};

		const initialWorkers =
			knownTotal !== null
				? Math.min(pageConcurrency, knownTotal)
				: pageConcurrency;

		for (let index = 0; index < initialWorkers; index += 1) {
			if (signal.aborted) {
				break;
			}

			schedulePageFetch();
		}

		await pageQueue.drain();

		if (knownTotal === null) {
			emit({ type: "page-total", total: fetchedPages });
		}

		await Promise.allSettled(downloadTasks);

		if (!signal.aborted) {
			emit({ type: "status", stage: "complete" });
		}
	};

	return {
		start: () => run().catch((error) => {
			if (signal.aborted) {
				return;
			}

			emit({ type: "error", error });
			throw error;
		}),
		stop: () => abortController.abort(),
	};
};

module.exports = {
	createEmojiPipeline,
	DEFAULT_DOWNLOAD_CONCURRENCY,
	DEFAULT_PAGE_CONCURRENCY,
};
