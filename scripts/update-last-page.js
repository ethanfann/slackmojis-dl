#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { findLastPage } = require("../src/services/slackmojis/findLastPage");
const { MIN_LAST_PAGE_INDEX } = require("../src/services/slackmojis/lastPageHint");

const run = async () => {
	const lastPage = await findLastPage({ floor: MIN_LAST_PAGE_INDEX });
	const data = { lastPage, updatedAt: new Date().toISOString() };
	const outputDir = path.join(__dirname, "..", "data");
	const outputPath = path.join(outputDir, "lastPage.json");

	await fs.promises.mkdir(outputDir, { recursive: true });
	await fs.promises.writeFile(outputPath, JSON.stringify(data, null, 2));
};

run().catch((error) => {
	console.error("Failed to update last page", error);
	process.exit(1);
});
