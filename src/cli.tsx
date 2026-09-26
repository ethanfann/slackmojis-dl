#!/usr/bin/env node
import path from "node:path";
import { Command, InvalidArgumentError, Option } from "commander";
import { type Instance, render } from "ink";
import App from "./app.js";
import { getValidCategories } from "./emoji/categories.js";
import { writeJsonAtomically } from "./services/filesystem/write-json.js";
import {
	downloadThrottleConfig,
	pageThrottleConfig,
} from "./services/slackmojis/config.js";
import { fetchAllEmojis } from "./services/slackmojis/index.js";

type CliFlags = {
	dest?: string;
	limit?: number;
	pageConcurrency?: number;
	downloadConcurrency?: number;
	dump?: boolean;
	category?: string;
};

const parsePageLimit = (value: string): number => {
	const parsed = Number(value);
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed)) {
		throw new InvalidArgumentError("Expected a non-negative safe integer.");
	}
	return parsed;
};

const parseConcurrency = (value: string): number => {
	const parsed = parsePageLimit(value);
	if (parsed === 0) {
		throw new InvalidArgumentError("Concurrency must be greater than zero.");
	}
	return parsed;
};

const validCategories = getValidCategories();
const categoryOption = new Option(
	"--category <name>",
	"The category name to download",
);

if (validCategories.length > 0) {
	categoryOption.choices(validCategories);
}

const program = new Command()
	.name("slackmojis-dl")
	.option(
		"--dest <path>",
		"Output directory that defaults to the working directory",
	)
	.option(
		"--limit <number>",
		"Restrict the number of pages to download (0 skips fetching)",
		parsePageLimit,
	)
	.option(
		"--page-concurrency <number>",
		`Number of page fetch workers (default ${pageThrottleConfig.defaultConcurrency})`,
		parseConcurrency,
	)
	.option(
		"--download-concurrency <number>",
		`Number of concurrent downloads (default ${downloadThrottleConfig.defaultConcurrency})`,
		parseConcurrency,
	)
	.option("--dump", "Save the emoji listing to ./emojis.json")
	.addOption(categoryOption)
	.showHelpAfterError();

program.parse(process.argv);

const run = async (): Promise<void> => {
	const flags = program.opts<CliFlags>();
	const controller = new AbortController();
	const cancel = (exitCode: number) => {
		if (controller.signal.aborted) return;
		process.exitCode = exitCode;
		controller.abort(new Error("Download cancelled."));
	};
	const onInterrupt = () => cancel(130);
	const onTerminate = () => cancel(143);
	process.on("SIGINT", onInterrupt);
	process.on("SIGTERM", onTerminate);
	let app: Instance | undefined;

	try {
		if (flags.dump) {
			const results = await fetchAllEmojis({
				limit: flags.limit,
				concurrency: flags.pageConcurrency,
				signal: controller.signal,
			});
			const selected = flags.category
				? results.filter((emoji) => emoji.category.name === flags.category)
				: results;
			controller.signal.throwIfAborted();
			await writeJsonAtomically(
				path.join(flags.dest ?? ".", "emojis.json"),
				selected,
			);
			return;
		}

		app = render(
			<App
				{...flags}
				signal={controller.signal}
				onCancel={onInterrupt}
				onComplete={(hasErrors) => {
					if (hasErrors && !controller.signal.aborted) process.exitCode = 1;
				}}
			/>,
			{ exitOnCtrlC: false },
		);

		await app.waitUntilExit();
	} finally {
		process.off("SIGINT", onInterrupt);
		process.off("SIGTERM", onTerminate);
		app?.cleanup();

		if (process.stdout.isTTY) {
			console.log();
		}
	}
};

run().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = process.exitCode || 1;
});
