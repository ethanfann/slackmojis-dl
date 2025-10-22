const scheduleAsync = (fn) => {
	if (typeof setImmediate === "function") {
		setImmediate(fn);
	} else {
		setTimeout(fn, 0);
	}
};

const createTaskQueue = (limit, { onStatsChange } = {}) => {
	const maxConcurrency = Number.isFinite(limit) && limit > 0 ? limit : 1;
	let activeCount = 0;
	const pending = [];

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

	const push = (task) =>
		new Promise((resolve, reject) => {
			pending.push({ task, resolve, reject });
			emitStats();
			scheduleAsync(runNext);
		});

	const drain = () => {
		if (activeCount === 0 && pending.length === 0) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
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
		stats: () => ({
			active: activeCount,
			pending: pending.length,
		}),
		drain,
	};
};

export { createTaskQueue };
