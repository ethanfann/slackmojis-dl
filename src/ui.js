const React = require("react");
const path = require("node:path");
const fs = require("node:fs");
const download = require("./util/download");
const { performance } = require("node:perf_hooks");
const obtain = require("./util/obtain");
const getLastPage = require("./util/getLastPage");
const loadExistingEmojis = require("./util/loadExistingEmojis");
const prepare = require("./util/prepare");
const { mapWithConcurrency } = require("./util/concurrency");

const DOWNLOAD_CONCURRENCY = 100;
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

	const formEmojiName = (emojiName, count) => {
		const parsedPath = path.parse(emojiName);

		return count === 0
			? emojiName
			: `${parsedPath.name}-${count}${[parsedPath.ext]}`;
	};

	React.useEffect(() => {
		let isMounted = true;

		const run = async () => {
			try {
				const outputDir =
					dest === "emojis" ? `${process.cwd()}/emojis` : `${dest}/emojis`;
				if (!fs.existsSync(outputDir)) {
					fs.mkdirSync(outputDir, { recursive: true });
				}

				const resolvedLastPage = await getLastPage();
				if (!isMounted) return;
				setLastPage(resolvedLastPage);

				const results = await obtain(limit, resolvedLastPage);
				if (!isMounted) return;

				let downloadList = prepare(results, categoryName, outputDir);
				const existingEmojis = loadExistingEmojis(outputDir);

				if (existingEmojis) {
					downloadList = downloadList.filter(
						(emoji) =>
							!existingEmojis.includes(path.join(emoji.category, emoji.name)),
					);
				}

				if (!isMounted) return;
				setTotalEmojis(downloadList.length);
				setFetched(true);

				if (downloadList.length === 0) {
					return;
				}

				const startTime = performance.now();

				const updateElapsed = () => {
					if (!isMounted) return;
					setElapsedTime(() => (performance.now() - startTime) / 1000);
				};

				const formatErrorMessage = (error) => {
					if (!error) return "Unknown error";
					const baseMessage = error.message || "Unknown error";
					const causeMessage = error.cause?.message;
					return causeMessage ? `${baseMessage}: ${causeMessage}` : baseMessage;
				};

				await mapWithConcurrency(
					downloadList,
					DOWNLOAD_CONCURRENCY,
					async (emoji) => {
						if (!fs.existsSync(emoji.dest)) {
							fs.mkdirSync(emoji.dest, { recursive: true });
						}

						let dupeCount = 0;
						while (
							fs.existsSync(
								path.join(emoji.dest, formEmojiName(emoji.name, dupeCount)),
							)
						) {
							dupeCount += 1;
						}

						const finalFileName = formEmojiName(emoji.name, dupeCount);
						const destinationPath = path.join(emoji.dest, finalFileName);
						const eventKey = path.join(emoji.category, finalFileName);

						try {
							await download(emoji.url, destinationPath, {
								maxRetries: 2,
							});

							if (!isMounted) return;
							setDownloads((previousDownloads) => [
								...previousDownloads,
								{
									id: previousDownloads.length,
									title: `Downloaded ${emoji.dest}/${finalFileName}`,
								},
							]);
						} catch (error) {
							if (!isMounted) return;
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
										title: `Failed ${emoji.dest}/${finalFileName}: ${message}`,
									},
								];
							});
						} finally {
							updateElapsed();
						}
					},
				);
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
		};
	}, []);

	const processedEmojis = downloads.length + errors.length;
	const elapsedSeconds = elapsedTime;
	const formattedElapsed =
		elapsedSeconds > 0 ? elapsedSeconds.toFixed(1) : "0.0";
	const emojisPerSecond =
		elapsedSeconds > 0
			? Math.round((processedEmojis / elapsedSeconds) * 10) / 10
			: 0;

	if (lastPage === 0) {
		return h(
			Text,
			null,
			h(Text, { color: "green" }, h(Spinner, { type: "dots" })),
			" Determining Last Page Of Emojis",
		);
	}

	if (totalEmojis === 0 && !fetched) {
		const pageCount = limit ? limit : lastPage;
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
				`Progress: ${processedEmojis} / ${totalEmojis} | Successes: ${downloads.length} | Errors: ${errors.length} | Elapsed: ${formattedElapsed}s | ${emojisPerSecond} emoji/s`,
			),
		),
	);
};

module.exports = App;
