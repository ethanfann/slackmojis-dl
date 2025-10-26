#!/usr/bin/env node
import fs from "node:fs";
import { type Instance, render } from "ink";
import { Command, Option } from "commander";
import App from "./app.js";
import {
	downloadThrottleConfig,
	pageThrottleConfig,
} from "./services/slackmojis/config.js";
import {
	fetchAllEmojis,
	resolveLastPageHint,
} from "./services/slackmojis/index.js";
import { getValidCategories } from "./emoji/categories.js";

type CliFlags = {
	dest?: string;
	limit?: number;
	pageConcurrency?: number;
	downloadConcurrency?: number;
	dump?: boolean;
	category?: string;
};

const parseNumber = (value: string): number => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new TypeError(`Expected a number but received "${value}"`);
	}
	return parsed;
};


const validCategories = getValidCategories();
const categoryOption = new Option("--category <name>", "The category name to download");

if (validCategories.length > 0) {
	categoryOption.choices(validCategories);
}

const program = new Command()
	.name("slackmojis-dl")
	.option("--dest <path>", "Output directory that defaults to the working directory")
	.option("--limit <number>", "Restrict the number of pages to download", parseNumber)
	.option(
		"--page-concurrency <number>",
		`Number of page fetch workers (default ${pageThrottleConfig.defaultConcurrency})`,
		parseNumber,
	)
	.option(
		"--download-concurrency <number>",
		`Number of concurrent downloads (default ${downloadThrottleConfig.defaultConcurrency})`,
		parseNumber,
	)
	.option("--dump", "Save the emoji listing to ./emojis.json")
	.addOption(categoryOption)
	.showHelpAfterError();

program.parse(process.argv);

const run = async (): Promise<void> => {
	const flags = program.opts<CliFlags>();

	if (
		validCategories.length > 0 &&
		flags.category &&
		!validCategories.includes(flags.category)
	) {
		console.error(
			`Invalid category "${flags.category}". Valid options are: ${validCategories.join(", ")}`,
		);
		process.exit(1);
	}

	if (flags.dump) {
		try {
			const lastPageHint = await resolveLastPageHint();
			const results = await fetchAllEmojis({
				limit: flags.limit,
				lastPageHint,
			});
			const data = JSON.stringify(results);
			fs.writeFileSync("emojis.json", data);
		} catch (error) {
			const message =
				error instanceof Error && typeof error.message === "string"
					? error.message
					: "Unable to dump emoji listing.";
			console.error(message);

			if (error && typeof error === "object" && "cause" in error) {
				const cause = (error as { cause?: unknown }).cause;
				if (cause !== undefined) {
					console.error(cause);
				}
			}
			process.exitCode = 1;
		}

		return;
	}

	const pageConcurrency = numberFlag(flags.pageConcurrency) ?? undefined;
	const downloadConcurrency =
		numberFlag(flags.downloadConcurrency) ?? undefined;

	let app: Instance | undefined;

	try {
		app = render(
			<App
				{...flags}
				pageConcurrency={pageConcurrency}
				downloadConcurrency={downloadConcurrency}
			/>,
		);

		if (typeof app?.waitUntilExit === "function") {
			await app.waitUntilExit();
		}
	} finally {
		if (typeof app?.cleanup === "function") {
			app.cleanup();
		}

		if (process.stdout.isTTY) {
			console.log();
		}
	}
};

const numberFlag = (value: unknown): number | undefined => {
	if (value === undefined || value === null) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

run().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
