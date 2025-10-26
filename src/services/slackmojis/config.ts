type SlackmojisDownloadConfig = {
	maxRetries: number;
	retryDelayMs: number;
	jitterRatio: number;
	backoffMultiplier: number;
	maxDelayMs: number;
};

type AdaptiveThrottleConfig = {
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
};

type ThrottleConfig = {
	defaultConcurrency: number;
	adaptive: AdaptiveThrottleConfig;
};

const DEFAULT_DOWNLOAD_CONFIG: SlackmojisDownloadConfig = {
	maxRetries: 2,
	retryDelayMs: 250,
	jitterRatio: 1,
	backoffMultiplier: 2,
	maxDelayMs: 60_000,
};

const DEFAULT_DOWNLOAD_THROTTLE: ThrottleConfig = {
	defaultConcurrency: 200,
	adaptive: {
		min: 50,
		max: 400,
		increaseStep: 25,
		decreaseStep: 40,
		decreaseRatio: 0.85,
		lowLatencyMs: 400,
		highLatencyMs: 1500,
		maxErrorRateForIncrease: 0.05,
		highErrorRateForDecrease: 0.15,
		pendingPressure: 5,
		sampleWindow: 30,
		minSamples: 6,
		cooldownMs: 1500,
	},
};

const DEFAULT_PAGE_THROTTLE: ThrottleConfig = {
	defaultConcurrency: 12,
	adaptive: {
		min: 6,
		max: 40,
		increaseStep: 2,
		decreaseStep: 2,
		decreaseRatio: 0.8,
		lowLatencyMs: 250,
		highLatencyMs: 900,
		maxErrorRateForIncrease: 0.1,
		highErrorRateForDecrease: 0.2,
		pendingPressure: 1,
		sampleWindow: 20,
		minSamples: 5,
		cooldownMs: 1200,
	},
};

const DEFAULT_FETCH_ALL_PAGE_CONCURRENCY = 10;

type ParseNumberOptions = {
	allowFloat?: boolean;
	min?: number;
	max?: number;
};

const parseNumberFromEnv = (
	key: string,
	fallback: number,
	options: ParseNumberOptions = {},
): number => {
	const rawValue = process.env[key];
	if (rawValue === undefined || rawValue === "") {
		return fallback;
	}

	const parsed = options.allowFloat
		? Number.parseFloat(rawValue)
		: Number.parseInt(rawValue, 10);

	if (!Number.isFinite(parsed)) {
		return fallback;
	}

	if (options.min !== undefined && parsed < options.min) {
		return fallback;
	}

	if (options.max !== undefined && parsed > options.max) {
		return fallback;
	}

	return parsed;
};

const resolveDownloadConfig = (): SlackmojisDownloadConfig => {
	const maxRetries = parseNumberFromEnv(
		"SLACKMOJIS_DOWNLOAD_MAX_RETRIES",
		DEFAULT_DOWNLOAD_CONFIG.maxRetries,
		{ allowFloat: false, min: 0 },
	);

	const retryDelayMs = parseNumberFromEnv(
		"SLACKMOJIS_DOWNLOAD_RETRY_DELAY_MS",
		DEFAULT_DOWNLOAD_CONFIG.retryDelayMs,
		{ allowFloat: false, min: 1 },
	);

	const jitterRatio = parseNumberFromEnv(
		"SLACKMOJIS_DOWNLOAD_JITTER_RATIO",
		DEFAULT_DOWNLOAD_CONFIG.jitterRatio,
		{ allowFloat: true, min: 0 },
	);

	const backoffMultiplier = parseNumberFromEnv(
		"SLACKMOJIS_DOWNLOAD_BACKOFF_MULTIPLIER",
		DEFAULT_DOWNLOAD_CONFIG.backoffMultiplier,
		{ allowFloat: true, min: 1 },
	);

	const maxDelayMs = parseNumberFromEnv(
		"SLACKMOJIS_DOWNLOAD_MAX_DELAY_MS",
		DEFAULT_DOWNLOAD_CONFIG.maxDelayMs,
		{ allowFloat: false, min: retryDelayMs },
	);

	return {
		maxRetries,
		retryDelayMs,
		jitterRatio,
		backoffMultiplier,
		maxDelayMs,
	};
};

const resolveAdaptiveConfig = (
	prefix: string,
	defaults: AdaptiveThrottleConfig,
): AdaptiveThrottleConfig => {
	const min = parseNumberFromEnv(`${prefix}MIN`, defaults.min, {
		min: 1,
	});

	const max = parseNumberFromEnv(`${prefix}MAX`, defaults.max, {
		min,
	});

	const increaseStep = parseNumberFromEnv(
		`${prefix}INCREASE_STEP`,
		defaults.increaseStep,
		{ min: 1 },
	);

	const decreaseStep = parseNumberFromEnv(
		`${prefix}DECREASE_STEP`,
		defaults.decreaseStep,
		{ min: 1 },
	);

	const decreaseRatio = parseNumberFromEnv(
		`${prefix}DECREASE_RATIO`,
		defaults.decreaseRatio,
		{ allowFloat: true, min: 0.01, max: 0.99 },
	);

	const lowLatencyMs = parseNumberFromEnv(
		`${prefix}LOW_LATENCY_MS`,
		defaults.lowLatencyMs,
		{ min: 1 },
	);

	const highLatencyMs = parseNumberFromEnv(
		`${prefix}HIGH_LATENCY_MS`,
		defaults.highLatencyMs,
		{ min: lowLatencyMs },
	);

	const maxErrorRateForIncrease = parseNumberFromEnv(
		`${prefix}MAX_ERROR_RATE_FOR_INCREASE`,
		defaults.maxErrorRateForIncrease,
		{ allowFloat: true, min: 0, max: 1 },
	);

	const highErrorRateForDecrease = parseNumberFromEnv(
		`${prefix}HIGH_ERROR_RATE_FOR_DECREASE`,
		defaults.highErrorRateForDecrease,
		{ allowFloat: true, min: 0, max: 1 },
	);

	const pendingPressure = parseNumberFromEnv(
		`${prefix}PENDING_PRESSURE`,
		defaults.pendingPressure,
		{ min: 0 },
	);

	const sampleWindow = parseNumberFromEnv(
		`${prefix}SAMPLE_WINDOW`,
		defaults.sampleWindow,
		{ min: 1 },
	);

	const minSamples = parseNumberFromEnv(
		`${prefix}MIN_SAMPLES`,
		defaults.minSamples,
		{ min: 1, max: sampleWindow },
	);

	const cooldownMs = parseNumberFromEnv(
		`${prefix}COOLDOWN_MS`,
		defaults.cooldownMs,
		{ min: 0 },
	);

	return {
		min,
		max: Math.max(max, min),
		increaseStep,
		decreaseStep,
		decreaseRatio,
		lowLatencyMs,
		highLatencyMs,
		maxErrorRateForIncrease,
		highErrorRateForDecrease,
		pendingPressure,
		sampleWindow,
		minSamples: Math.min(minSamples, sampleWindow),
		cooldownMs,
	};
};

const resolveThrottleConfig = (
	namespace: string,
	defaults: ThrottleConfig,
): ThrottleConfig => {
	const adaptive = resolveAdaptiveConfig(
		`${namespace}_ADAPTIVE_`,
		defaults.adaptive,
	);
	const rawDefaultConcurrency = parseNumberFromEnv(
		`${namespace}_CONCURRENCY`,
		defaults.defaultConcurrency,
		{ min: 1 },
	);

	const defaultConcurrency = Math.min(
		Math.max(rawDefaultConcurrency, adaptive.min),
		adaptive.max,
	);

	return {
		defaultConcurrency,
		adaptive,
	};
};

const slackmojisDownloadConfig = resolveDownloadConfig();
const downloadThrottleConfig = resolveThrottleConfig(
	"SLACKMOJIS_DOWNLOAD",
	DEFAULT_DOWNLOAD_THROTTLE,
);
const pageThrottleConfig = resolveThrottleConfig(
	"SLACKMOJIS_PAGE",
	DEFAULT_PAGE_THROTTLE,
);
const fetchAllPageConcurrency = parseNumberFromEnv(
	"SLACKMOJIS_FETCH_ALL_PAGE_CONCURRENCY",
	DEFAULT_FETCH_ALL_PAGE_CONCURRENCY,
	{ min: 1 },
);

export {
	downloadThrottleConfig,
	fetchAllPageConcurrency,
	pageThrottleConfig,
	slackmojisDownloadConfig,
};
export type {
	AdaptiveThrottleConfig,
	SlackmojisDownloadConfig,
	ThrottleConfig,
};
