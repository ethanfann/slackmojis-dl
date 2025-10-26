type Task<T> = () => Promise<T> | T;

type PendingTask<T> = {
	task: Task<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
};

type QueueStats = {
	active: number;
	pending: number;
};

type TaskQueueOptions = {
	onStatsChange?: (stats: QueueStats) => void;
};

const scheduleAsync = (fn: () => void): void => {
	if (typeof setImmediate === "function") {
		setImmediate(fn);
	} else {
		setTimeout(fn, 0);
	}
};

const normalizeConcurrency = (value: number | undefined): number => {
	if (Number.isFinite(value) && (value as number) > 0) {
		return Math.floor(value as number);
	}

	return 1;
};

const createTaskQueue = <T>(
	limit: number | undefined,
	options: TaskQueueOptions = {},
) => {
	let maxConcurrency = normalizeConcurrency(limit);
	let activeCount = 0;
	const pending: Array<PendingTask<T>> = [];
	const onStatsChange = options.onStatsChange;

	const emitStats = () => {
		if (typeof onStatsChange === "function") {
			onStatsChange({
				active: activeCount,
				pending: pending.length,
			});
		}
	};

	const runNext = () => {
		if (activeCount >= maxConcurrency) {
			return;
		}

		const next = pending.shift();
		if (!next) {
			emitStats();
			return;
		}

		activeCount += 1;
		emitStats();

		Promise.resolve()
			.then(next.task)
			.then((value) => {
				next.resolve(value);
			})
			.catch((error) => {
				next.reject(error);
			})
			.finally(() => {
				activeCount -= 1;
				emitStats();
				if (pending.length > 0) {
					scheduleAsync(runNext);
				}
			});
	};

	const push = (task: Task<T>): Promise<T> =>
		new Promise<T>((resolve, reject) => {
			pending.push({ task, resolve, reject });
			emitStats();
			scheduleAsync(runNext);
		});

	const setConcurrency = (value: number): number => {
		const normalized = normalizeConcurrency(value);
		if (normalized === maxConcurrency) {
			return maxConcurrency;
		}

		const previous = maxConcurrency;
		maxConcurrency = normalized;
		emitStats();

		if (maxConcurrency > previous && pending.length > 0) {
			scheduleAsync(runNext);
		}

		return maxConcurrency;
	};

	const drain = (): Promise<void> => {
		if (activeCount === 0 && pending.length === 0) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			const check = () => {
				if (activeCount === 0 && pending.length === 0) {
					resolve();
					return;
				}

				setTimeout(check, 25);
			};

			check();
		});
	};

	return {
		push,
		setConcurrency,
		getConcurrency: (): number => maxConcurrency,
		stats: (): QueueStats => ({
			active: activeCount,
			pending: pending.length,
		}),
		drain,
	};
};

export { createTaskQueue };
export type { QueueStats };
