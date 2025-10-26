import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SlackmozisMetadata = {
	lastPage: number;
	categories: string[];
	updatedAt?: string;
};

type RawMetadata = {
	lastPage?: unknown;
	categories?: unknown;
	updatedAt?: unknown;
};

const parseLastPage = (value: unknown): number | null => {
	if (Number.isFinite(value) && (value as number) >= 0) {
		return Math.floor(value as number);
	}

	return null;
};

const parseCategories = (value: unknown): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	const normalized = value
		.map((category) =>
			typeof category === "string" ? category.trim() : "",
		)
		.filter((name) => name.length > 0);

	const unique = Array.from(new Set(normalized));
	return unique.sort((a, b) => a.localeCompare(b, "en"));
};

const parseUpdatedAt = (value: unknown): string | undefined => {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadRawMetadata = (): RawMetadata => {
	try {
		return require(
			path.join(__dirname, "../../data/slackmojis-metadata.json"),
		) as RawMetadata;
	} catch {
		return {};
	}
};

const rawMetadata = loadRawMetadata();
const normalizedLastPage = parseLastPage(rawMetadata.lastPage);

const normalizedMetadata = {
	lastPage: normalizedLastPage ?? 0,
	categories: parseCategories(rawMetadata.categories),
	updatedAt: parseUpdatedAt(rawMetadata.updatedAt),
} as const;

const BUNDLED_METADATA: Readonly<SlackmozisMetadata> = Object.freeze({
	lastPage: normalizedMetadata.lastPage,
	categories: normalizedMetadata.categories,
	updatedAt: normalizedMetadata.updatedAt,
});

const getBundledMetadata = (): SlackmozisMetadata => ({
	lastPage: BUNDLED_METADATA.lastPage,
	categories: [...BUNDLED_METADATA.categories],
	updatedAt: BUNDLED_METADATA.updatedAt,
});

export { getBundledMetadata };
export type { SlackmozisMetadata };
