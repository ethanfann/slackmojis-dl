import * as fsPromises from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
	buildDownloadTargets,
	type DownloadTarget,
} from "../emoji/build-download-targets.js";
import {
	createTaskQueue,
	type QueueStats,
} from "../lib/task-queue.js";
import {
	createAdaptiveConcurrencyController,
	type AdaptiveConcurrencyController,
} from "../lib/adaptive-concurrency.js";
import { listEmojiEntries } from "../services/filesystem/emoji-inventory.js";
import {
	readRunMetadata,
	writeRunMetadata,
} from "../services/filesystem/run-metadata.js";
import {
	downloadImage,
	fetchPage,
	findLastPage,
	MIN_LAST_PAGE_INDEX,
	resolveLastPageHint,
} from "../services/slackmojis/index.js";
import type { SlackmojiEntry } from "../types/slackmoji.js";

const DEFAULT_DOWNLOAD_CONCURRENCY = 200;
const DEFAULT_PAGE_CONCURRENCY = 12;
const DOWNLOAD_ADAPTIVE_CONFIG = {
	min: 50,
	max: 400,
	increaseStep: 25,
	decreaseStep: 40,
	decreaseRatio: 0.85,
	lowLatencyMs: 400,
	highLatencyMs: 1500,
	maxErrorRateForIncrease: 0.05,
	highErrorRateForDecrease: 0.15,
	pendingPressure: 5,
	sampleWindow: 30,
	minSamples: 6,
	cooldownMs: 1500,
} as const;
const PAGE_ADAPTIVE_CONFIG = {
	min: 6,
	max: 40,
	increaseStep: 2,
	decreaseStep: 2,
	decreaseRatio: 0.8,
	lowLatencyMs: 250,
	highLatencyMs: 900,
	maxErrorRateForIncrease: 0.1,
	highErrorRateForDecrease: 0.2,
	pendingPressure: 1,
	sampleWindow: 20,
	minSamples: 5,
	cooldownMs: 1200,
} as const;
const normalizeKey = (category: string, name: string): string =>
	path.join(category, name);

const parseLastPageIndex = (value: unknown): number | null => {
	if (Number.isFinite(value) && (value as number) >= 0) {
		return Math.floor(value as number);
	}

	return null;
};

const buildFileName = (originalName: string, attempt: number): string => {
	if (attempt === 0) {
		return originalName;
	}

	const parsed = path.parse(originalName);
	return `${parsed.name}-${attempt}${parsed.ext}`;
};

const formatErrorMessage = (error: unknown): string => {
	if (!error) return "Unknown error";
	const baseMessage =
		(error as { message?: string }).message || "Unknown error";
	const causeMessage = (error as { cause?: { message?: string } })?.cause
		?.message;
	return causeMessage ? `${baseMessage}: ${causeMessage}` : baseMessage;
};

type PipelineStatusStage = "determine-last-page" | "fetching" | "complete";

type PipelineEventLogEntry = {
	key: string;
	title: string;
};

type PipelineProgress = {
	fetched: number;
	current: number;
};

type EmojiPipelineEvent =
	| { type: "status"; stage: PipelineStatusStage }
	| { type: "page-total"; total: number }
	| { type: "meta"; lastPage: number }
	| { type: "expected-total"; count: number }
	| { type: "existing-entries"; count: number }
	| { type: "page-progress"; progress: PipelineProgress }
	| { type: "page-stats"; stats: QueueStats }
	| { type: "downloads-scheduled"; count: number }
	| { type: "download-stats"; stats: QueueStats }
	| { type: "download-success"; entry: PipelineEventLogEntry }
	| { type: "download-error"; entry: PipelineEventLogEntry; error?: string }
	| { type: "elapsed"; seconds: number }
	| { type: "error"; error: unknown };

type EmojiPipelineOptions = {
	dest: string;
	limit?: number | null;
	category?: string | null;
	downloadConcurrency?: number | null;
	pageConcurrency?: number | null;
	onEvent?: (event: EmojiPipelineEvent) => void;
};

type EmojiPipeline = {
	start: () => Promise<void>;
	stop: () => void;
};

const ensurePositiveInteger = (
	value: number | null | undefined,
	fallback: number,
): number => {
	if (Number.isFinite(value) && (value as number) > 0) {
		return Math.floor(value as number);
	}

	return fallback;
};

const createEmojiPipeline = ({
	dest,
	limit,
	category,
	onEvent,
	downloadConcurrency,
	pageConcurrency,
}: EmojiPipelineOptions): EmojiPipeline => {
	const abortController = new AbortController();
	const { signal } = abortController;

	const emit = (event: EmojiPipelineEvent): void => {
		if (signal.aborted) {
			return;
		}

		onEvent?.(event);
	};

	const run = async (): Promise<void> => {
		const rootDir = dest === "emojis" ? process.cwd() : dest;
		const outputDir = path.join(rootDir, "emojis");

		await fsPromises.mkdir(outputDir, { recursive: true });

		if (signal.aborted) {
			return;
		}

		let storedLastPageIndex: number | null = null;
		try {
			const metadata = await readRunMetadata(outputDir);
			storedLastPageIndex = parseLastPageIndex(metadata?.lastPage);
		} catch (error) {
			console.error(`Failed to read metadata: ${formatErrorMessage(error)}`);
		}

		const limitProvided = limit !== undefined && limit !== null;
		let maxPages: number | null = null;

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

		emit({ type: "status", stage: "determine-last-page" });

		let knownTotal: number | null = maxPages;
		if (knownTotal !== null) {
			emit({ type: "page-total", total: knownTotal });
		}

		const pageResultsCache = new Map<number, SlackmojiEntry[]>();
		const inFlightPages = new Map<number, Promise<SlackmojiEntry[]>>();
		const fetchPageAndCache = (
			pageIndex: number,
		): Promise<SlackmojiEntry[]> => {
			if (pageResultsCache.has(pageIndex)) {
				return Promise.resolve(pageResultsCache.get(pageIndex) ?? []);
			}

			if (inFlightPages.has(pageIndex)) {
				return inFlightPages.get(pageIndex) ?? Promise.resolve([]);
			}

			const task = fetchPage(pageIndex)
				.then((results) => (Array.isArray(results) ? results : []))
				.then((normalized) => {
					pageResultsCache.set(pageIndex, normalized);
					return normalized;
				})
				.finally(() => {
					inFlightPages.delete(pageIndex);
				});

			inFlightPages.set(pageIndex, task);
			return task;
		};

		let scheduledDownloadTotal = 0;
		let finalLastPageIndex: number | null = null;

		const remoteHintPromise =
			maxPages === null
				? resolveLastPageHint().catch(() => null)
				: Promise.resolve<number | null>(null);

		const lastPageProbePromise = (async (): Promise<void> => {
			try {
				let targetIndex: number;
				if (maxPages !== null) {
					targetIndex = Math.max(maxPages - 1, 0);
				} else {
					const remoteHint = await remoteHintPromise;
					const combinedHint = Math.max(
						MIN_LAST_PAGE_INDEX,
						storedLastPageIndex ?? MIN_LAST_PAGE_INDEX,
						remoteHint ?? MIN_LAST_PAGE_INDEX,
					);
					targetIndex = await findLastPage({ floor: combinedHint });
				}

				const _results = await fetchPageAndCache(targetIndex);
				if (signal.aborted) {
					return;
				}

				finalLastPageIndex = targetIndex;
				const totalPages = targetIndex + 1;

				if (knownTotal === null || knownTotal < totalPages) {
					knownTotal = totalPages;
					emit({ type: "page-total", total: totalPages });
				}

				emit({ type: "meta", lastPage: targetIndex });
			} catch (error) {
				if (signal.aborted) {
					return;
				}

				console.error(
					`Unable to determine last page: ${formatErrorMessage(error)}`,
				);
			}
		})();

		const existingEntries = listEmojiEntries(outputDir);
		const existingSet = new Set(existingEntries);
		const reservedKeys = new Set<string>();

		emit({ type: "existing-entries", count: existingEntries.length });

		let startTime: number | null = null;

		const ensureStartTime = () => {
			if (startTime === null) {
				startTime = performance.now();
			}
		};

		const updateElapsed = () => {
			if (startTime === null || signal.aborted) {
				return;
			}

			const elapsedSeconds = (performance.now() - startTime) / 1000;
			emit({ type: "elapsed", seconds: elapsedSeconds });
		};

		const ensuredDirectories = new Set<string>();
		const ensureDir = async (dir: string): Promise<void> => {
			if (ensuredDirectories.has(dir)) {
				return;
			}

			await fsPromises.mkdir(dir, { recursive: true });
			ensuredDirectories.add(dir);
		};

		const reserveDestination = async (emoji: DownloadTarget) => {
			await ensureDir(emoji.dest);

			let attempt = 0;
			let fileName: string;
			let key: string;

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

		const downloadConcurrencyValue = ensurePositiveInteger(
			downloadConcurrency,
			DEFAULT_DOWNLOAD_CONCURRENCY,
		);

		const adaptiveDownloadsEnabled = downloadConcurrency === undefined;
		let downloadAdaptive: AdaptiveConcurrencyController | null = null;

		const downloadQueue = createTaskQueue<void>(downloadConcurrencyValue, {
			onStatsChange: (stats) => {
				downloadAdaptive?.observeStats(stats);
				emit({ type: "download-stats", stats });
			},
		});

		if (adaptiveDownloadsEnabled) {
			downloadAdaptive = createAdaptiveConcurrencyController({
				queue: downloadQueue,
				initial: downloadConcurrencyValue,
				min: DOWNLOAD_ADAPTIVE_CONFIG.min,
				max: DOWNLOAD_ADAPTIVE_CONFIG.max,
				increaseStep: DOWNLOAD_ADAPTIVE_CONFIG.increaseStep,
				decreaseStep: DOWNLOAD_ADAPTIVE_CONFIG.decreaseStep,
				decreaseRatio: DOWNLOAD_ADAPTIVE_CONFIG.decreaseRatio,
				lowLatencyMs: DOWNLOAD_ADAPTIVE_CONFIG.lowLatencyMs,
				highLatencyMs: DOWNLOAD_ADAPTIVE_CONFIG.highLatencyMs,
				maxErrorRateForIncrease:
					DOWNLOAD_ADAPTIVE_CONFIG.maxErrorRateForIncrease,
				highErrorRateForDecrease:
					DOWNLOAD_ADAPTIVE_CONFIG.highErrorRateForDecrease,
				pendingPressure: DOWNLOAD_ADAPTIVE_CONFIG.pendingPressure,
				sampleWindow: DOWNLOAD_ADAPTIVE_CONFIG.sampleWindow,
				minSamples: DOWNLOAD_ADAPTIVE_CONFIG.minSamples,
				cooldownMs: DOWNLOAD_ADAPTIVE_CONFIG.cooldownMs,
			});
		}

		const downloadTasks: Promise<void>[] = [];

		const scheduleDownload = (emoji: DownloadTarget): void => {
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

					let transferStartedAt: number | null = null;
					try {
						transferStartedAt = performance.now();
						await downloadImage(emoji.url, destination.fullPath, {
							maxRetries: 2,
						});

						if (signal.aborted) {
							return;
						}

						if (downloadAdaptive && transferStartedAt !== null) {
							downloadAdaptive.recordSuccess(
								performance.now() - transferStartedAt,
							);
						}

						existingSet.add(destination.eventKey);
						reservedKeys.delete(destination.eventKey);

						emit({
							type: "download-success",
							entry: {
								key: destination.eventKey,
								title: `✓ ${emoji.dest}/${destination.fileName}`,
							},
						});
					} catch (error) {
						if (downloadAdaptive) {
							const duration =
								transferStartedAt !== null
									? performance.now() - transferStartedAt
									: 0;
							downloadAdaptive.recordFailure(duration);
						}

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

			downloadTasks.push(taskPromise.then(() => undefined));
		};

		emit({ type: "status", stage: "fetching" });

		const pageConcurrencyValue = ensurePositiveInteger(
			pageConcurrency,
			DEFAULT_PAGE_CONCURRENCY,
		);

		const adaptivePagesEnabled = pageConcurrency === undefined;
		let pageAdaptive: AdaptiveConcurrencyController | null = null;

		const pageQueue = createTaskQueue<void>(pageConcurrencyValue, {
			onStatsChange: (stats) => {
				pageAdaptive?.observeStats(stats);
				emit({ type: "page-stats", stats });
			},
		});

		let fetchedPages = 0;
		let nextPageIndex = 0;
		let endReached = false;
		let pageWorkersInFlight = 0;

		const updatePageTotal = (candidate: number) => {
			if (!Number.isFinite(candidate) || candidate < 0) {
				return;
			}

			const normalized = Math.floor(candidate);
			if (knownTotal === null || normalized < knownTotal) {
				knownTotal = normalized;
				emit({ type: "page-total", total: knownTotal });
			}
		};

		const getPageResults = async (
			pageIndex: number,
		): Promise<SlackmojiEntry[]> => {
			const results = await fetchPageAndCache(pageIndex);
			pageResultsCache.delete(pageIndex);
			return results;
		};

		const canScheduleMorePages = (): boolean => {
			if (signal.aborted || endReached) {
				return false;
			}

			if (knownTotal !== null && nextPageIndex >= knownTotal) {
				return false;
			}

			return true;
		};

		function schedulePageFetch(): boolean {
			if (!canScheduleMorePages()) {
				return false;
			}

			const pageIndex = nextPageIndex;
			nextPageIndex += 1;
			pageWorkersInFlight += 1;

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

					const fetchStartedAt = performance.now();

					try {
						const pageResults = await getPageResults(pageIndex);

						if (signal.aborted) {
							return;
						}

						if (pageAdaptive) {
							pageAdaptive.recordSuccess(performance.now() - fetchStartedAt);
						}

						const normalizedResults = Array.isArray(pageResults)
							? pageResults
							: [];

						if (normalizedResults.length === 0) {
							endReached = true;
							if (pageIndex > 0) {
								finalLastPageIndex = pageIndex - 1;
							}
							updatePageTotal(pageIndex);
							return;
						}

						const prepared = buildDownloadTargets(
							normalizedResults,
							category,
							outputDir,
						);
						const newDownloads: DownloadTarget[] = [];

						for (const emoji of prepared) {
							const key = normalizeKey(emoji.category, emoji.name);
							if (existingSet.has(key)) {
								continue;
							}

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

						scheduledDownloadTotal += newDownloads.length;

						fetchedPages += 1;

						emit({
							type: "page-progress",
							progress: {
								fetched: fetchedPages,
								current: pageIndex + 1,
							},
						});
					} catch (error) {
						if (signal.aborted) {
							return;
						}

						if (pageAdaptive) {
							pageAdaptive.recordFailure(performance.now() - fetchStartedAt);
						}

						const message = formatErrorMessage(error);
						console.error(`Failed to fetch page ${pageIndex}: ${message}`);
						emit({ type: "error", error });
					} finally {
						pageWorkersInFlight -= 1;
						if (!signal.aborted) {
							fillPageWorkers();
						}
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

			return true;
		}

		function fillPageWorkers(): void {
			while (
				pageWorkersInFlight < pageQueue.getConcurrency() &&
				canScheduleMorePages()
			) {
				if (!schedulePageFetch()) {
					break;
				}
			}
		}

		if (adaptivePagesEnabled) {
			pageAdaptive = createAdaptiveConcurrencyController({
				queue: pageQueue,
				initial: pageConcurrencyValue,
				min: PAGE_ADAPTIVE_CONFIG.min,
				max: PAGE_ADAPTIVE_CONFIG.max,
				increaseStep: PAGE_ADAPTIVE_CONFIG.increaseStep,
				decreaseStep: PAGE_ADAPTIVE_CONFIG.decreaseStep,
				decreaseRatio: PAGE_ADAPTIVE_CONFIG.decreaseRatio,
				lowLatencyMs: PAGE_ADAPTIVE_CONFIG.lowLatencyMs,
				highLatencyMs: PAGE_ADAPTIVE_CONFIG.highLatencyMs,
				maxErrorRateForIncrease:
					PAGE_ADAPTIVE_CONFIG.maxErrorRateForIncrease,
				highErrorRateForDecrease:
					PAGE_ADAPTIVE_CONFIG.highErrorRateForDecrease,
				pendingPressure: PAGE_ADAPTIVE_CONFIG.pendingPressure,
				sampleWindow: PAGE_ADAPTIVE_CONFIG.sampleWindow,
				minSamples: PAGE_ADAPTIVE_CONFIG.minSamples,
				cooldownMs: PAGE_ADAPTIVE_CONFIG.cooldownMs,
				onLimitChange: () => {
					if (!signal.aborted) {
						fillPageWorkers();
					}
				},
			});
		}

		fillPageWorkers();

		await pageQueue.drain();

		if (knownTotal === null) {
			emit({ type: "page-total", total: fetchedPages });
		}

		if (!signal.aborted) {
			emit({ type: "expected-total", count: scheduledDownloadTotal });
		}

		await downloadQueue.drain();
		await Promise.allSettled(downloadTasks);
		await lastPageProbePromise;

		if (!signal.aborted && finalLastPageIndex !== null) {
			try {
				await writeRunMetadata(outputDir, {
					lastPage: finalLastPageIndex,
				});
			} catch (error) {
				console.error(`Failed to write metadata: ${formatErrorMessage(error)}`);
			}
		}

		if (!signal.aborted) {
			emit({ type: "status", stage: "complete" });
		}
	};

	return {
		start: () =>
			run().catch((error) => {
				if (signal.aborted) {
					return;
				}

				emit({ type: "error", error });
				throw error;
			}),
		stop: () => abortController.abort(),
	};
};

export {
	createEmojiPipeline,
	DEFAULT_DOWNLOAD_CONCURRENCY,
	DEFAULT_PAGE_CONCURRENCY,
};

export type { EmojiPipelineEvent, EmojiPipelineOptions };
