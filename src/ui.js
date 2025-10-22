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

const BoundedLog = ({ entries, height, width, ink }) => {
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

const numberFormatter = new Intl.NumberFormat("en-US");

const formatCount = (value, fallback = "?") => {
	if (value === null || value === undefined) {
		return fallback;
	}

	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}

	return numberFormatter.format(numeric);
};

const formatRate = (value) => {
	if (!Number.isFinite(value)) {
		return "0.0";
	}

	return value.toFixed(1);
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

	const resolvedColumns = columns ?? stdout?.columns ?? process.stdout?.columns;
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
		totalEmojis,
		downloads,
		errors,
		elapsedSeconds,
		completed,
		existingCount,
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

	const totalKnown =
		Number.isFinite(pageTotal) && pageTotal >= 0 ? Math.floor(pageTotal) : null;

	const pageLabelForStatus = (() => {
		if (totalKnown !== null && pageStatus.fetched >= totalKnown) {
			return "All pages queued";
		}

		if (totalKnown !== null || pageStatus.fetched > 0) {
			return `Pages queued ${formatCount(pageStatus.fetched)}/${formatCount(totalKnown)}`;
		}

		return null;
	})();

	const logEntries = React.useMemo(() => {
		const successEntries = downloads.map((entry) => ({
			...entry,
			type: entry.type ?? "success",
		}));
		const errorEntries = errors.map((entry) => ({
			...entry,
			type: entry.type ?? "error",
		}));

		return successEntries.concat(errorEntries).sort((left, right) => {
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
		const sanitizedLimit = hasValidLimit
			? Math.max(Math.floor(parsedLimit), 0)
			: null;
		const pageCount =
			totalKnown !== null
				? totalKnown
				: sanitizedLimit !== null
					? sanitizedLimit
					: lastPage !== null && Number.isFinite(lastPage)
						? lastPage + 1
						: "?";
		if (existingCount > 0) {
			return h(
				Text,
				null,
				h(Text, { color: "green" }, h(Spinner, { type: "dots" })),
				` Determining where to resume (${formatCount(existingCount)} existing)`,
			);
		}

		const requestLabel =
			pageCount === "?"
				? " Requesting Emoji Listing"
				: ` Requesting Emoji Listing For ${pageCount} Pages`;
		return h(
			Text,
			null,
			h(Text, { color: "green" }, h(Spinner, { type: "dots" })),
			requestLabel,
		);
	}

	if (totalEmojis === 0 && completed) {
		return h(Text, { color: "green" }, "✔ Up to Date");
	}

	const totalEmojiLabel =
		totalEmojis > 0 || (completed && totalEmojis >= 0)
			? existingCount + totalEmojis
			: null;

	const progressCount = existingCount + downloads.length;

	const errorLabel =
		errors.length > 0 ? `Errors ${formatCount(errors.length)}` : null;

	const statusSegments = [
		`Progress ${formatCount(progressCount)}/${formatCount(totalEmojiLabel)}`,
		`Elapsed ${formattedElapsed}s`,
		`${formatRate(emojisPerSecond)} emoji/s`,
	];

	[pageLabelForStatus, errorLabel].forEach((segment) => {
		if (segment) {
			statusSegments.push(segment);
		}
	});

	const statusLine = statusSegments.join(" | ");

	return h(
		Box,
		{ flexDirection: "column", width: "100%", height: "100%", flexGrow: 1 },
		h(BoundedLog, {
			entries: logEntries,
			height: logHeight,
			width: viewportWidth,
			ink,
		}),
		h(Box, { marginTop: 1 }, h(Text, { dimColor: true }, statusLine)),
	);
};

module.exports = App;
