const React = require("react");
const { useEmojiDownloader } = require("./hooks/useEmojiDownloader");
const { useTerminalDimensions } = require("./hooks/useTerminalDimensions");

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

const BoundedLog = ({
	entries,
	height,
	width,
	ink,
}) => {
	const { Box, Text } = ink;
	const total = entries.length;
	const boundedHeight =
		Number.isFinite(height) && height > 0 ? Math.floor(height) : total || 1;
	const visibleCount = Math.max(boundedHeight, 1);
	const startIndex = Math.max(total - visibleCount, 0);
	const visibleEntries = entries.slice(startIndex);
	const containerProps = {
		flexDirection: "column",
		flexGrow: 1,
		height: visibleCount,
		minHeight: visibleCount,
		justifyContent: "flex-end",
	};

	if (Number.isFinite(width) && width > 0) {
		containerProps.width = Math.floor(width);
	}

	return h(
		Box,
		containerProps,
		visibleEntries.map((entry, index) => {
			const position = startIndex + index;

			const color =
				entry.type === "error"
					? "red"
					: entry.type === "warning"
						? "yellow"
						: "green";

			const derivedKey = entry.key
				? `entry-${entry.key}-${position}`
				: `entry-${entry.sequence ?? position}-${position}`;

			return h(
				Text,
				{
					key: derivedKey,
					color,
				},
				entry.title,
			);
		}),
	);
};

const App = ({
    dest = "emojis",
    limit = null,
    category: categoryName = null,
    pageConcurrency = null,
    downloadConcurrency = null,
	stdout = process.stdout,
    ink = null,
}) => {
	if (!ink) {
		throw new Error("Ink components are required");
	}

	const { Text, Box } = ink;
	const { columns, rows } = useTerminalDimensions(stdout);

	const resolvedColumns =
		columns ?? stdout?.columns ?? process.stdout?.columns;
	const resolvedRows = rows ?? stdout?.rows ?? process.stdout?.rows;

	const reservedRows = 2; // status line and padding
	const logHeight =
		Number.isFinite(resolvedRows) && resolvedRows > reservedRows
			? resolvedRows - reservedRows
			: undefined;
	const viewportWidth = Number.isFinite(resolvedColumns)
		? resolvedColumns
		: undefined;
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

	const logEntries = React.useMemo(() => {
		const successEntries = downloads.map((entry) => ({
			...entry,
			type: entry.type ?? "success",
		}));
		const errorEntries = errors.map((entry) => ({
			...entry,
			type: entry.type ?? "error",
		}));

		return successEntries
			.concat(errorEntries)
			.sort((left, right) => {
				const leftSeq = left.sequence ?? 0;
				const rightSeq = right.sequence ?? 0;
				return leftSeq - rightSeq;
			});
	}, [downloads, errors]);

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
		Box,
		{ flexDirection: "column", width: "100%", height: "100%", flexGrow: 1 },
		h(BoundedLog, {
			entries: logEntries,
			height: logHeight,
			width: viewportWidth,
			ink,
		}),
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
