#!/usr/bin/env tsx
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllEmojis } from "../src/services/slackmojis/fetch-all-emojis.js";
import { findLastPage } from "../src/services/slackmojis/find-last-page.js";
import type { SlackmojiEntry } from "../src/types/slackmoji.js";
import { getBundledMetadata } from "../src/data/bundled-metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metadataPath = path.join(__dirname, "..", "data", "slackmojis-metadata.json");

const normalizeCategoryName = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const collectCategories = (entries: SlackmojiEntry[]): string[] => {
	const categories = new Set<string>();

	for (const entry of entries) {
		const name = normalizeCategoryName(entry?.category?.name);
		if (name) {
			categories.add(name);
		}
	}

	return Array.from(categories).sort((a, b) => a.localeCompare(b, "en"));
};

const run = async (): Promise<void> => {
	const existing = getBundledMetadata();
	const floor =
		Number.isFinite(existing.lastPage) && existing.lastPage >= 0
			? Math.floor(existing.lastPage)
			: 0;

	console.log(`Determining last page starting from floor ${floor}...`);
	const lastPage = await findLastPage({ floor });
	console.log(`Discovered last page index: ${lastPage}`);

	console.log(`Fetching emojis across ${lastPage + 1} pages...`);
	const entries = await fetchAllEmojis({ limit: lastPage + 1 });
	console.log(`Fetched ${entries.length} emojis; building category set...`);

	const categories = collectCategories(entries);
	console.log(`Derived ${categories.length} categories.`);

	const payload = {
		lastPage,
		categories,
		updatedAt: new Date().toISOString(),
	};

	await fs.mkdir(path.dirname(metadataPath), { recursive: true });
	await fs.writeFile(metadataPath, `${JSON.stringify(payload, null, 2)}\n`);

	console.log(`Wrote metadata to ${metadataPath}`);
};

run().catch((error) => {
	console.error("Failed to update Slackmojis metadata", error);
	process.exit(1);
});
