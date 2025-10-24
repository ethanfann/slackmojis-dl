#!/usr/bin/env node
import fs from "node:fs";
import { render } from "ink";
import meow from "meow";
import React from "react";
import App from "./app.js";
import {
	fetchAllEmojis,
	resolveLastPageHint,
} from "./services/slackmojis/index.js";

const meowCli = meow.default ?? meow;

const cli = meowCli(
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

const run = async () => {
	if (cli.flags.dump) {
		try {
			const lastPageHint = await resolveLastPageHint();
			const results = await fetchAllEmojis({
				limit: cli.flags.limit,
				lastPageHint,
			});
			const data = JSON.stringify(results);
			fs.writeFileSync("emojis.json", data);
		} catch (error) {
			console.error(error?.message || "Unable to dump emoji listing.");
			if (error?.cause) {
				console.error(error.cause);
			}
			process.exitCode = 1;
		}

		return;
	}

	const pageConcurrency = numberFlag(cli.flags.pageConcurrency) ?? undefined;
	const downloadConcurrency =
		numberFlag(cli.flags.downloadConcurrency) ?? undefined;

	let app;

	try {
		app = render(
			React.createElement(App, {
				...cli.flags,
				pageConcurrency,
				downloadConcurrency,
			}),
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

const numberFlag = (value) => {
	if (value === undefined || value === null) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
