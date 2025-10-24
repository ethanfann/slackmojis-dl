#!/usr/bin/env node
import fs from "node:fs";
import { type Instance, render } from "ink";
import meow from "meow";
import App from "./app.js";
import {
	fetchAllEmojis,
	resolveLastPageHint,
} from "./services/slackmojis/index.js";

type MeowModule = typeof meow & { readonly default?: typeof meow };

const meowModule = meow as MeowModule;
const meowCli = meowModule.default ?? meowModule;

type CliFlagDefinitions = {
	dest: meow.StringFlag;
	limit: meow.NumberFlag;
	"page-concurrency": meow.NumberFlag;
	"download-concurrency": meow.NumberFlag;
	dump: meow.BooleanFlag;
	category: meow.StringFlag;
};

type CliFlags = {
	dest?: string;
	limit?: number;
	pageConcurrency?: number;
	downloadConcurrency?: number;
	dump?: boolean;
	category?: string;
};

const cli = meowCli<CliFlagDefinitions>(
	`
	Usage
	  $ ./cli.js
  Options
    --dest  Output directory that defaults to the working directory
    --limit Restrict the number of pages to download
    --page-concurrency  Number of page fetch workers (default 8)
    --download-concurrency  Number of concurrent downloads (default 200)
    --dump  Save the emoji listing to ./emojis.json
            Override save location with --path
    --category The category name to download
  Examples
    $ ./cli.js --dest desired/path
    $ ./cli.js --limit=5
    $ ./cli.js --dest desired/path --dump
    $ ./cli.js --category "Hangouts Blob"
`,
	{
		flags: {
			dest: { type: "string" },
			limit: { type: "number" },
			"page-concurrency": { type: "number" },
			"download-concurrency": { type: "number" },
			dump: { type: "boolean" },
			category: { type: "string" },
		},
	},
);

const run = async (): Promise<void> => {
	const flags = cli.flags as CliFlags;

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
