#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findLastPage } from "../src/services/slackmojis/find-last-page.js";
import { MIN_LAST_PAGE_INDEX } from "../src/services/slackmojis/last-page-hint.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const run = async () => {
	const lastPage = await findLastPage({ floor: MIN_LAST_PAGE_INDEX });
	const data = { lastPage, updatedAt: new Date().toISOString() };
	const outputDir = path.join(__dirname, "..", "data");
	const outputPath = path.join(outputDir, "lastPage.json");

	await fs.mkdir(outputDir, { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
};

run().catch((error) => {
	console.error("Failed to update last page", error);
	process.exit(1);
});
