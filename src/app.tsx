import { Box, Static, Text } from "ink";
import React, { type FC } from "react";
import {
	type DownloaderState,
	useEmojiDownloader,
} from "./hooks/use-emoji-downloader.js";
import { ProgressBar } from "./ui/progress-bar.js";
import { Spinner } from "./ui/spinner.js";

const h = React.createElement;

type SummaryHandler = (summary: string | null) => void;

type RenderProgressBarProps = {
	ratio?: number | null;
	width?: number;
	elementKey?: string;
};

type LogEntry = DownloaderState["downloads"][number];

type AppProps = {
	dest?: string;
	limit?: number | null;
	category?: string | null;
	pageConcurrency?: number | null;
	downloadConcurrency?: number | null;
	onSummary?: SummaryHandler | null;
};

const numberFormatter = new Intl.NumberFormat("en-US");

const formatCount = (value: unknown, fallback: string = "?"): string => {
	if (value === null || value === undefined) {
		return fallback;
	}

	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return fallback;
	}

	return numberFormatter.format(numeric);
};

const formatRate = (value: number): string => {
	if (!Number.isFinite(value)) {
		return "0.0";
	}

	return value.toFixed(1);
};

const formatEta = (value: number | null): string | null => {
	if (value === null || !Number.isFinite(value) || value <= 0) {
		return null;
	}

	const totalSeconds = Math.ceil(value);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}

	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}

	return `${seconds}s`;
};

const renderProgressBar = ({
	ratio = 0,
	width = 40,
	elementKey,
}: RenderProgressBarProps): React.ReactElement => {
	const normalizedWidth = Math.max(Math.floor(width), 1);
	const safeRatio = Math.min(Math.max(ratio ?? 0, 0), 1);
	const percentValue = Math.min(Math.max(safeRatio * 100, 0), 100);

	return (
		<Box key={elementKey} width={normalizedWidth} minWidth={normalizedWidth}>
			<ProgressBar value={percentValue} />
		</Box>
	);
};

const App: FC<AppProps> = ({
	dest = "emojis",
	limit = null,
	category: categoryName = null,
	pageConcurrency = null,
	downloadConcurrency = null,
	onSummary = null,
}) => {
	const downloaderState: DownloaderState = useEmojiDownloader({
		dest,
		limit,
		category: categoryName,
		pageConcurrency,
		downloadConcurrency,
	});

	const {
		status,
		lastPage,
		pageTotal,
		pageStatus,
		totalEmojis,
		expectedTotal,
		downloads,
		errors,
		elapsedSeconds,
		completed,
		existingCount,
	} = downloaderState;

	const downloadCount = downloads.length;
	const errorCount = errors.length;
	const latestErrorEntry = errorCount > 0 ? errors[errorCount - 1] : null;
	const processedEmojis = downloadCount + errorCount;
	const formattedElapsed =
		elapsedSeconds > 0 ? elapsedSeconds.toFixed(1) : "0.0";
	const rawDownloadsPerSecond =
		elapsedSeconds > 0 ? downloadCount / elapsedSeconds : 0;
	const emojisPerSecond =
		elapsedSeconds > 0
			? Math.round((processedEmojis / elapsedSeconds) * 10) / 10
			: 0;

	const totalKnown =
		typeof pageTotal === "number" &&
		Number.isFinite(pageTotal) &&
		pageTotal >= 0
			? Math.floor(pageTotal)
			: null;

	const pageLabelForStatus = (() => {
		if (totalKnown !== null && pageStatus.fetched >= totalKnown) {
			return "All pages queued";
		}

		if (totalKnown !== null || pageStatus.fetched > 0) {
			return `Pages queued ${formatCount(pageStatus.fetched)}/${formatCount(totalKnown)}`;
		}

		return null;
	})();

	const logEntries = React.useMemo<LogEntry[]>(() => {
		return [...downloads, ...errors].sort((left, right) => {
			const leftSeq = left.sequence ?? 0;
			const rightSeq = right.sequence ?? 0;
			return leftSeq - rightSeq;
		});
	}, [downloads, errors]);

	const progressCount = existingCount + downloadCount;
	const downloadsTarget = expectedTotal ?? totalEmojis ?? null;
	const progressTarget =
		downloadsTarget !== null ? existingCount + downloadsTarget : null;

	React.useEffect(() => {
		if (typeof onSummary !== "function") {
			return;
		}

		if (status === "error") {
			const failureSegments = [
				"Download failed",
				downloadCount > 0
					? `Added ${formatCount(downloadCount)} emoji${downloadCount === 1 ? "" : "s"}`
					: null,
				errorCount > 0
					? `${formatCount(errorCount)} error${errorCount === 1 ? "" : "s"}`
					: null,
				latestErrorEntry?.title ?? null,
			]
				.filter(Boolean)
				.join(" | ");
			onSummary(failureSegments || "Download failed");
			return;
		}

		if (completed) {
			const summarySegments = [
				"Download complete",
				`Added ${formatCount(downloadCount)} emoji${downloadCount === 1 ? "" : "s"}`,
			];

			if (existingCount > 0) {
				summarySegments.push(`Existing ${formatCount(existingCount)}`);
			}

			if (progressTarget !== null) {
				summarySegments.push(`Total ${formatCount(progressTarget)}`);
			}

			summarySegments.push(
				errorCount > 0
					? `${formatCount(errorCount)} error${errorCount === 1 ? "" : "s"}`
					: "No errors",
			);

			if (elapsedSeconds > 0) {
				summarySegments.push(`Elapsed ${formattedElapsed}s`);
			}

			if (dest) {
				summarySegments.push(`Saved to ${dest}`);
			}

			onSummary(summarySegments.join(" | "));
			return;
		}

		onSummary(null);
	}, [
		completed,
		dest,
		downloadCount,
		elapsedSeconds,
		errorCount,
		existingCount,
		formattedElapsed,
		latestErrorEntry,
		onSummary,
		progressTarget,
		status,
	]);

	if (status === "error") {
		const fatalMessage = latestErrorEntry?.title ?? "Unexpected error";
		return h(Text, { color: "red" }, fatalMessage);
	}

	if (status === "determining-last-page") {
		return h(
			Text,
			null,
			h(Text, { color: "green" }, h(Spinner)),
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
				h(Text, { color: "green" }, h(Spinner)),
				` Determining where to resume (${formatCount(existingCount)} existing)`,
			);
		}

		const requestLabel =
			pageCount === "?"
				? " Requesting Emoji Listing"
				: ` Requesting Emoji Listing For ${pageCount} Pages`;
		return h(Text, null, h(Text, { color: "green" }, h(Spinner)), requestLabel);
	}

	if (totalEmojis === 0 && completed) {
		return h(Text, { color: "green" }, "✔ Up to Date");
	}

	const totalEmojiLabel =
		expectedTotal !== null || totalEmojis > 0 || (completed && totalEmojis >= 0)
			? existingCount + (expectedTotal ?? totalEmojis ?? 0)
			: null;

	const progressRatio =
		progressTarget && progressTarget > 0
			? Math.min(Math.max(progressCount / progressTarget, 0), 1)
			: null;

	const remainingDownloads =
		downloadsTarget !== null
			? Math.max(downloadsTarget - downloadCount, 0)
			: null;
	const etaSeconds =
		remainingDownloads !== null &&
		remainingDownloads > 0 &&
		rawDownloadsPerSecond > 0
			? remainingDownloads / rawDownloadsPerSecond
			: null;
	const etaValue = etaSeconds !== null ? formatEta(etaSeconds) : null;

	const errorLabel =
		errorCount > 0 ? `Errors ${formatCount(errorCount)}` : null;

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

	const progressBarWidth = 40;
	const progressPercentLabel =
		progressRatio !== null ? `${Math.round(progressRatio * 100)}%` : null;

	let progressBarLine = null;
	if (progressRatio !== null) {
		const segments = [
			renderProgressBar({
				ratio: progressRatio,
				width: progressBarWidth,
				elementKey: "progress-bar",
			}),
		];

		if (progressPercentLabel) {
			segments.push(
				h(
					Box,
					{ key: "progress-bar-percent", marginLeft: 1 },
					h(Text, { dimColor: true }, progressPercentLabel),
				),
			);
		}

		if (etaValue) {
			segments.push(
				h(
					Box,
					{ key: "progress-bar-eta", marginLeft: 1 },
					h(Text, { dimColor: true }, `${etaValue} remaining`),
				),
			);
		}

		progressBarLine = h(
			Box,
			{ marginTop: 1, flexDirection: "row", alignItems: "center" },
			segments,
		);
	}

		const logSection =
		logEntries.length > 0
			? h(Static, {
					items: logEntries,
					children: (item: unknown, index: number) => {
						const entry = item as LogEntry;
						const entryType = entry.type as string;
						const color =
							entryType === "error"
								? "red"
								: entryType === "warning"
									? "yellow"
									: "green";
						const derivedKey =
							entry.key ??
							(entry.sequence !== undefined
								? `entry-${entry.sequence}`
								: `entry-${index}`);

						return h(
							Box,
							{ key: derivedKey },
							h(Text, { color }, entry.title ?? ""),
						);
					},
				})
			: null;

	const statusMarginTop = logSection ? 1 : 0;

	return h(
		Box,
		{ flexDirection: "column" },
		logSection,
		h(
			Box,
			{ marginTop: statusMarginTop },
			h(Text, { dimColor: true }, statusLine),
		),
		progressBarLine,
	);
};

export type { AppProps };
export default App;
