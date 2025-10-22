#!/usr/bin/env node
import React from "react";
import meow from "meow";
import fs from "node:fs";
import ui from "./ui.js";
import {
	fetchAllEmojis,
	resolveLastPageHint,
} from "./services/slackmojis/index.js";
import { enterFullscreen } from "./lib/terminal/full-screen.js";

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
	const [inkModule, inkUiModule] = await Promise.all([
		import("ink"),
		import("@inkjs/ui"),
	]);
	const { render } = inkModule;
	const inkUiTheme =
		typeof inkUiModule.extendTheme === "function" && inkUiModule.defaultTheme
			? inkUiModule.extendTheme(inkUiModule.defaultTheme, {
					components: {
						ProgressBar: {
							styles: {
								completed: () => ({
									color: "green",
								}),
							},
						},
					},
				})
			: null;

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

	const pageConcurrency =
		numberFlag(cli.flags.pageConcurrency) ?? undefined;
	const downloadConcurrency =
		numberFlag(cli.flags.downloadConcurrency) ?? undefined;

	const fullscreenCleanup = enterFullscreen(process.stdout);

	try {
		const app = render(
			React.createElement(ui, {
				...cli.flags,
				pageConcurrency,
				downloadConcurrency,
				stdout: process.stdout,
				ink: inkModule,
				inkUi: inkUiModule,
				inkUiTheme,
			}),
		);

		if (typeof app?.waitUntilExit === "function") {
			await app.waitUntilExit();
		}

		if (typeof app?.cleanup === "function") {
			app.cleanup();
		}
	} finally {
		fullscreenCleanup();
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
