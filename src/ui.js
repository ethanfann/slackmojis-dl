const React = require("react");
const { useEmojiDownloader } = require("./hooks/useEmojiDownloader");

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
    pageConcurrency = null,
    downloadConcurrency = null,
    ink = null,
}) => {
	if (!ink) {
		throw new Error("Ink components are required");
	}

	const { Text, Static, Box } = ink;
	const {
		status,
		lastPage,
		pageTotal,
		pageStatus,
		downloadStats,
		totalEmojis,
		downloads,
		errors,
		elapsedSeconds,
		completed,
    } = useEmojiDownloader({
        dest,
        limit,
        category: categoryName,
        pageConcurrency,
        downloadConcurrency,
    });

	const processedEmojis = downloads.length + errors.length;
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

	if (status === "error") {
		const fatalMessage =
			errors.length > 0 ? errors[errors.length - 1].title : "Unexpected error";
		return h(Text, { color: "red" }, fatalMessage);
	}

	if (status === "determining-last-page") {
		return h(
			Text,
			null,
			h(Text, { color: "green" }, h(Spinner, { type: "dots" })),
			" Determining Last Page Of Emojis",
		);
	}

	if (totalEmojis === 0 && !completed) {
		const parsedLimit = Number(limit);
		const hasValidLimit =
			limit !== null && limit !== undefined && Number.isFinite(parsedLimit);
		const sanitizedLimit = hasValidLimit ? Math.max(Math.floor(parsedLimit), 0) : null;
		const pageCount =
			pageTotal > 0
				? pageTotal
				: sanitizedLimit !== null
					? sanitizedLimit
					: lastPage !== null && Number.isFinite(lastPage)
						? lastPage + 1
						: 0;
		return h(
			Text,
			null,
			h(Text, { color: "green" }, h(Spinner, { type: "dots" })),
			` Requesting Emoji Listing For ${pageCount} Pages`,
		);
	}

	if (totalEmojis === 0 && completed) {
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
