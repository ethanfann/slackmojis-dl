const React = require("react");
const path = require("node:path");
const fsPromises = require("node:fs/promises");
const download = require("./util/download");
const { performance } = require("node:perf_hooks");
const getPage = require("./util/getPage");
const { resolvePageCount } = require("./util/obtain");
const getLastPage = require("./util/getLastPage");
const loadExistingEmojis = require("./util/loadExistingEmojis");
const prepare = require("./util/prepare");
const { createTaskQueue } = require("./util/taskQueue");

const DOWNLOAD_CONCURRENCY = 200;
const PAGE_FETCH_CONCURRENCY = 8;
const h = React.createElement;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const Spinner = () => {
	const [index, setIndex] = React.useState(0);

	React.useEffect(() => {
		const timer = setInterval(() => {
			setIndex((previous) => (previous + 1) % spinnerFrames.length);
		}, 80);

		return () => {
			clearInterval(timer);
		};
	}, []);

	return spinnerFrames[index];
};

const App = ({
	dest = "emojis",
	limit = null,
	category: categoryName = null,
	ink = null,
}) => {
	if (!ink) {
		throw new Error("Ink components are required");
	}

	const { Text, Static, Box } = ink;
	const [totalEmojis, setTotalEmojis] = React.useState(0);
	const [downloads, setDownloads] = React.useState([]);
	const [elapsedTime, setElapsedTime] = React.useState(0);
	const [fetched, setFetched] = React.useState(false);
	const [lastPage, setLastPage] = React.useState(0);
	const [errors, setErrors] = React.useState([]);
	const [pageTotal, setPageTotal] = React.useState(0);
	const [pageStatus, setPageStatus] = React.useState({
		fetched: 0,
		current: 0,
		active: 0,
		queued: 0,
	});
	const [downloadStats, setDownloadStats] = React.useState({
		active: 0,
		pending: 0,
	});

	const formEmojiName = (emojiName, count) => {
		const parsedPath = path.parse(emojiName);

		return count === 0
			? emojiName
			: `${parsedPath.name}-${count}${[parsedPath.ext]}`;
	};

	React.useEffect(() => {
		let isMounted = true;
		let cancelled = false;

		const formatErrorMessage = (error) => {
			if (!error) return "Unknown error";
			const baseMessage = error.message || "Unknown error";
			const causeMessage = error.cause?.message;
			return causeMessage ? `${baseMessage}: ${causeMessage}` : baseMessage;
		};

		const normalizeKey = (category, name) => path.join(category, name);

		const run = async () => {
			try {
				const outputDir =
					dest === "emojis" ? `${process.cwd()}/emojis` : `${dest}/emojis`;
				await fsPromises.mkdir(outputDir, { recursive: true });

				const resolvedLastPage = await getLastPage();
				if (!isMounted) return;
				setLastPage(resolvedLastPage);

				const pageCount = resolvePageCount(limit, resolvedLastPage);
				if (!isMounted) return;
				setPageTotal(pageCount);
				setPageStatus({
					fetched: 0,
					current: 0,
					active: 0,
					queued: pageCount,
				});

				if (pageCount === 0) {
					setFetched(true);
					setTotalEmojis(0);
					return;
				}

				const existingEntries =
					loadExistingEmojis(outputDir)?.map((entry) => path.normalize(entry)) ||
					[];
				const existingSet = new Set(existingEntries);
				const scheduledKeys = new Set();
				const ensuredDirectories = new Set();

				let startTime = null;

				const updateElapsed = () => {
					if (!isMounted || startTime === null) return;
					setElapsedTime((performance.now() - startTime) / 1000);
				};

				const ensureDir = async (dir) => {
					if (ensuredDirectories.has(dir)) {
						return;
					}

					await fsPromises.mkdir(dir, { recursive: true });
					ensuredDirectories.add(dir);
				};

				const pathExists = async (target) => {
					try {
						await fsPromises.access(target);
						return true;
					} catch {
						return false;
					}
				};

				const resolveDestination = async (emoji) => {
					await ensureDir(emoji.dest);

					let attempt = 0;
					let candidate = formEmojiName(emoji.name, attempt);
					let fullPath = path.join(emoji.dest, candidate);

					// eslint-disable-next-line no-await-in-loop
					while (await pathExists(fullPath)) {
						attempt += 1;
						candidate = formEmojiName(emoji.name, attempt);
						fullPath = path.join(emoji.dest, candidate);
					}

					return {
						fileName: candidate,
						path: fullPath,
						eventKey: normalizeKey(emoji.category, candidate),
					};
				};

				const downloadPromises = [];
				const downloadQueue = createTaskQueue(DOWNLOAD_CONCURRENCY, {
					onStatsChange: (stats) => {
						if (!isMounted) {
							return;
						}

						setDownloadStats(stats);
					},
				});

				const scheduleDownload = (emoji) => {
					if (cancelled) {
						return;
					}

					const job = downloadQueue.push(async () => {
						if (cancelled || !isMounted) {
							return;
						}

						const destination = await resolveDestination(emoji);
						if (cancelled || !isMounted) {
							return;
						}

						const { fileName, path: destinationPath, eventKey } = destination;

						if (startTime === null) {
							startTime = performance.now();
						}

						try {
							await download(emoji.url, destinationPath, {
								maxRetries: 2,
							});

							if (!isMounted || cancelled) {
								return;
							}

							existingSet.add(eventKey);
							setDownloads((previousDownloads) => [
								...previousDownloads,
								{
									id: previousDownloads.length,
									title: `Downloaded ${emoji.dest}/${fileName}`,
								},
							]);
						} catch (error) {
							if (!isMounted || cancelled) {
								return;
							}

							const message = formatErrorMessage(error);
							console.error(`Failed to download ${emoji.url}: ${message}`);

							setErrors((previousErrors) => {
								if (previousErrors.some((entry) => entry.key === eventKey)) {
									return previousErrors;
								}

								return [
									...previousErrors,
									{
										id: previousErrors.length,
										key: eventKey,
										title: `Failed ${emoji.dest}/${fileName}: ${message}`,
									},
								];
							});
						} finally {
							updateElapsed();
						}
					});

					downloadPromises.push(job);
				};

				const pagePromises = [];
				const pageQueue = createTaskQueue(PAGE_FETCH_CONCURRENCY, {
					onStatsChange: (stats) => {
						if (!isMounted) {
							return;
						}

						setPageStatus((previous) => ({
							...previous,
							active: stats.active,
							queued: stats.pending,
						}));
					},
				});

				const schedulePageFetch = (pageIndex) =>
					pageQueue.push(async () => {
						if (!isMounted || cancelled) {
							return;
						}

						setPageStatus((previous) => ({
							...previous,
							current: Math.max(previous.current, pageIndex + 1),
						}));

						const pageResults = await getPage(pageIndex);

						if (!isMounted || cancelled) {
							return;
						}

						const prepared = prepare(pageResults, categoryName, outputDir);
						const newDownloads = prepared.filter((emoji) => {
							const key = normalizeKey(emoji.category, emoji.name);
							if (existingSet.has(key) || scheduledKeys.has(key)) {
								return false;
							}

							scheduledKeys.add(key);
							return true;
						});

						if (newDownloads.length > 0) {
							setTotalEmojis((previous) => previous + newDownloads.length);
						}

						newDownloads.forEach((emoji) => {
							if (!cancelled && isMounted) {
								scheduleDownload(emoji);
							}
						});

						setPageStatus((previous) => ({
							...previous,
							fetched: previous.fetched + 1,
						}));
					});

				for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
					pagePromises.push(schedulePageFetch(pageIndex));
				}

				await Promise.allSettled(pagePromises);
				await Promise.allSettled(downloadPromises);

				if (!isMounted || cancelled) {
					return;
				}

				setFetched(true);
			} catch (error) {
				if (!isMounted) return;
				const message = formatErrorMessage(error);
				console.error(`Failed to prepare downloads: ${message}`);
				setErrors((previousErrors) => [
					...previousErrors,
					{
						id: previousErrors.length,
						key: `fatal-${previousErrors.length}`,
						title: `Failed to prepare downloads: ${message}`,
					},
				]);
			}
		};

		run();

		return () => {
			isMounted = false;
			cancelled = true;
		};
	}, [categoryName, dest, limit]);

	const processedEmojis = downloads.length + errors.length;
	const elapsedSeconds = elapsedTime;
	const formattedElapsed =
		elapsedSeconds > 0 ? elapsedSeconds.toFixed(1) : "0.0";
	const emojisPerSecond =
		elapsedSeconds > 0
			? Math.round((processedEmojis / elapsedSeconds) * 10) / 10
			: 0;

	const pageSummary =
		pageTotal > 0
			? `Pages: ${pageStatus.fetched}/${pageTotal}${
					pageStatus.active > 0 || pageStatus.queued > 0
						? ` (+${pageStatus.active} fetching${
								pageStatus.queued > 0 ? `, ${pageStatus.queued} queued` : ""
							}${
								pageStatus.current > 0
									? `, latest ${Math.min(pageStatus.current, pageTotal)}/${pageTotal}`
									: ""
							})`
						: pageStatus.current > 0
							? ` (latest ${Math.min(pageStatus.current, pageTotal)}/${pageTotal})`
							: ""
				}`
			: "Pages: 0/0";

	const downloadSummary =
		downloadStats.active > 0 || downloadStats.pending > 0
			? `Downloads: ${downloadStats.active} active, ${downloadStats.pending} queued`
			: "Downloads: idle";

	if (lastPage === 0) {
		return h(
			Text,
			null,
			h(Text, { color: "green" }, h(Spinner, { type: "dots" })),
			" Determining Last Page Of Emojis",
		);
	}

	if (totalEmojis === 0 && !fetched) {
		const pageCount = pageTotal > 0 ? pageTotal : lastPage + 1;
		return h(
			Text,
			null,
			h(Text, { color: "green" }, h(Spinner, { type: "dots" })),
			` Requesting Emoji Listing For ${pageCount} Pages`,
		);
	}

	if (totalEmojis === 0 && fetched) {
		return h(Text, { color: "green" }, "✔ Up to Date");
	}

	return h(
		React.Fragment,
		null,
		h(
			Static,
			{ items: downloads },
			(download) =>
				h(
					Box,
					{ key: download.id },
					h(Text, { color: "green" }, `✔ ${download.title}`),
				),
		),
		errors.length > 0
			? h(
					Static,
					{ items: errors },
					(failure) =>
						h(
							Box,
							{ key: failure.id },
							h(Text, { color: "red" }, `✖ ${failure.title}`),
						),
				)
			: null,
		h(
			Box,
			{ marginTop: 1 },
			h(
				Text,
				{ dimColor: true },
				`Progress: ${processedEmojis} / ${totalEmojis} | Successes: ${downloads.length} | Errors: ${errors.length} | ${pageSummary} | ${downloadSummary} | Elapsed: ${formattedElapsed}s | ${emojisPerSecond} emoji/s`,
			),
		),
	);
};

module.exports = App;
