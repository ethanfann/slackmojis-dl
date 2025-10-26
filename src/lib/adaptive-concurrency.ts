import type { QueueStats } from "./task-queue.js";

type AdaptiveQueue = {
	setConcurrency: (value: number) => number;
	getConcurrency: () => number;
};

type AdaptiveConcurrencyOptions = {
	queue: AdaptiveQueue;
	initial: number;
	min: number;
	max: number;
	increaseStep: number;
	decreaseStep: number;
	decreaseRatio: number;
	lowLatencyMs: number;
	highLatencyMs: number;
	maxErrorRateForIncrease: number;
	highErrorRateForDecrease: number;
	pendingPressure: number;
	sampleWindow: number;
	minSamples: number;
	cooldownMs: number;
	onLimitChange?: (limit: number) => void;
};

type AdaptiveConcurrencyController = {
	observeStats: (stats: QueueStats) => void;
	recordSuccess: (latencyMs: number) => void;
	recordFailure: (latencyMs: number) => void;
	current: () => number;
};

type Sample = {
	latency: number;
	success: boolean;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), max);

const now = (): number => Date.now();

const createAdaptiveConcurrencyController = ({
	queue,
	initial,
	min,
	max,
	increaseStep,
	decreaseStep,
	decreaseRatio,
	lowLatencyMs,
	highLatencyMs,
	maxErrorRateForIncrease,
	highErrorRateForDecrease,
	pendingPressure,
	sampleWindow,
	minSamples,
	cooldownMs,
	onLimitChange,
}: AdaptiveConcurrencyOptions): AdaptiveConcurrencyController => {
	let currentLimit = clamp(initial, min, max);
	let lastStats: QueueStats = { active: 0, pending: 0 };
	let lastAdjustment = 0;
	const samples: Sample[] = [];

	queue.setConcurrency(currentLimit);
	onLimitChange?.(currentLimit);

	const applyLimit = (nextLimit: number) => {
		const normalized = clamp(nextLimit, min, max);
		if (normalized === currentLimit) {
			return;
		}

		currentLimit = normalized;
		queue.setConcurrency(currentLimit);
		lastAdjustment = now();
		onLimitChange?.(currentLimit);
	};

	const recordSample = (latencyMs: number, success: boolean) => {
		const latency =
			Number.isFinite(latencyMs) && latencyMs > 0
				? latencyMs
				: success
					? lowLatencyMs
					: highLatencyMs;

		samples.push({ latency, success });
		while (samples.length > sampleWindow) {
			samples.shift();
		}
	};

	const getAverages = () => {
		if (samples.length === 0) {
			return { avgLatency: Number.POSITIVE_INFINITY, errorRate: 0 };
		}

		const totals = samples.reduce(
			(acc, sample) => {
				acc.latency += sample.latency;
				if (!sample.success) {
					acc.errors += 1;
				}
				return acc;
			},
			{ latency: 0, errors: 0 },
		);

		return {
			avgLatency: totals.latency / samples.length,
			errorRate: totals.errors / samples.length,
		};
	};

	const shouldCooldown = (): boolean => now() - lastAdjustment < cooldownMs;

	const requestDecrease = () => {
		const dropByStep = currentLimit - decreaseStep;
		const dropByRatio = Math.floor(currentLimit * decreaseRatio);
		const nextLimit = clamp(Math.max(dropByStep, dropByRatio), min, max);
		if (nextLimit < currentLimit) {
			applyLimit(nextLimit);
		}
	};

	const requestIncrease = () => {
		const nextLimit = clamp(currentLimit + increaseStep, min, max);
		if (nextLimit > currentLimit) {
			applyLimit(nextLimit);
		}
	};

	const evaluate = () => {
		if (samples.length < minSamples || shouldCooldown()) {
			return;
		}

		const { avgLatency, errorRate } = getAverages();
		const saturated =
			currentLimit > 0 &&
			(lastStats.active >= currentLimit ||
				lastStats.pending >= pendingPressure);

		if (errorRate >= highErrorRateForDecrease || avgLatency >= highLatencyMs) {
			requestDecrease();
			return;
		}

		if (
			saturated &&
			errorRate <= maxErrorRateForIncrease &&
			avgLatency <= lowLatencyMs
		) {
			requestIncrease();
		}
	};

	return {
		observeStats: (stats: QueueStats) => {
			lastStats = stats;
			evaluate();
		},
		recordSuccess: (latencyMs: number) => {
			recordSample(latencyMs, true);
			evaluate();
		},
		recordFailure: (latencyMs: number) => {
			recordSample(latencyMs, false);
			requestDecrease();
		},
		current: () => currentLimit,
	};
};

export { createAdaptiveConcurrencyController };
export type { AdaptiveConcurrencyController };
