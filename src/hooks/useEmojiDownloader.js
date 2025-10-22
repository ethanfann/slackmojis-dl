const React = require("react");
const {
	createEmojiPipeline,
	DEFAULT_DOWNLOAD_CONCURRENCY,
	DEFAULT_PAGE_CONCURRENCY,
} = require("../pipeline/emojiPipeline");

const initialState = {
	status: "idle",
	lastPage: null,
	pageTotal: null,
	logSequence: 0,
	existingCount: 0,
	pageStatus: {
		fetched: 0,
		current: 0,
		active: 0,
		queued: 0,
	},
	downloadStats: {
		active: 0,
		pending: 0,
	},
	totalEmojis: 0,
	downloads: [],
	errors: [],
	elapsedSeconds: 0,
	completed: false,
	failure: null,
};

const describeError = (error) => {
	if (!error) return "Unknown error";
	return error.message || String(error);
};

const applyEvent = (state, event) => {
	switch (event.type) {
		case "status": {
			const status =
				event.stage === "determine-last-page"
					? "determining-last-page"
					: event.stage === "fetching"
						? "fetching"
						: event.stage === "complete"
							? "complete"
							: state.status;

			const completed = event.stage === "complete";

			return {
				...state,
				status,
				completed: completed || state.completed,
			};
		}
		case "meta": {
			return {
				...state,
				lastPage: event.lastPage,
			};
		}
		case "page-total": {
			return {
				...state,
				pageTotal:
					Number.isFinite(event.total) && event.total >= 0
						? Math.floor(event.total)
						: null,
			};
		}
		case "existing-entries": {
			const count =
				Number.isFinite(event.count) && event.count >= 0
					? Math.floor(event.count)
					: 0;

			return {
				...state,
				existingCount: count,
			};
		}
		case "page-progress": {
			return {
				...state,
				pageStatus: {
					...state.pageStatus,
					fetched: event.progress.fetched,
					current: event.progress.current,
				},
			};
		}
		case "page-stats": {
			return {
				...state,
				pageStatus: {
					...state.pageStatus,
					active: event.stats.active,
					queued: event.stats.pending,
				},
			};
		}
		case "downloads-scheduled": {
			return {
				...state,
				totalEmojis: state.totalEmojis + event.count,
			};
		}
		case "download-stats": {
			return {
				...state,
				downloadStats: {
					active: event.stats.active,
					pending: event.stats.pending,
				},
			};
		}
		case "download-success": {
			const entrySequence = state.logSequence;

			return {
				...state,
				logSequence: entrySequence + 1,
				downloads: state.downloads.concat({
					id: state.downloads.length,
					sequence: entrySequence,
					key: event.entry.key ?? `download-${entrySequence}`,
					type: "success",
					title: event.entry.title,
				}),
			};
		}
		case "download-error": {
			const exists = state.errors.some(
				(error) => error.key === event.entry.key,
			);

			if (exists) {
				return state;
			}

			const entrySequence = state.logSequence;

			return {
				...state,
				logSequence: entrySequence + 1,
				errors: state.errors.concat({
					id: state.errors.length,
					key: event.entry.key,
					type: "error",
					sequence: entrySequence,
					title: event.entry.title,
				}),
			};
		}
		case "elapsed": {
			return {
				...state,
				elapsedSeconds: event.seconds,
			};
		}
		case "error": {
			const message = describeError(event.error);
			const fatalKey = `fatal-${state.errors.length}`;
			const entrySequence = state.logSequence;

			return {
				...state,
				status: "error",
				failure: event.error,
				logSequence: entrySequence + 1,
				errors: state.errors.concat({
					id: state.errors.length,
					key: fatalKey,
					type: "error",
					sequence: entrySequence,
					title: `Failed to complete download: ${message}`,
				}),
			};
		}
		default:
			return state;
	}
};

const useEmojiDownloader = ({
	dest,
	limit,
	category,
	pageConcurrency,
	downloadConcurrency,
}) => {
	const [state, setState] = React.useState(initialState);

	React.useEffect(() => {
		let cancelled = false;
		setState(() => ({
			...initialState,
			pageStatus: { ...initialState.pageStatus },
			downloadStats: { ...initialState.downloadStats },
		}));

		const pipeline = createEmojiPipeline({
			dest,
			limit,
			category,
			pageConcurrency:
				pageConcurrency ?? DEFAULT_PAGE_CONCURRENCY,
			downloadConcurrency:
				downloadConcurrency ?? DEFAULT_DOWNLOAD_CONCURRENCY,
			onEvent: (event) => {
				if (cancelled) {
					return;
				}

				setState((previous) => applyEvent(previous, event));
			},
		});

		pipeline.start().catch((error) => {
			if (cancelled) {
				return;
			}
			setState((previous) => applyEvent(previous, { type: "error", error }));
		});

		return () => {
			cancelled = true;
			pipeline.stop();
		};
	}, [dest, limit, category, pageConcurrency, downloadConcurrency]);

	return state;
};

module.exports = { useEmojiDownloader, initialState };
