#!/usr/bin/env node
const React = require("react");
const meow = require("meow");
const fs = require("node:fs");
const {
  fetchAllEmojis,
  findLastPage,
} = require("./services/slackmojis");

const ui = require("./ui");

const cli = meow(
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
	const inkModule = await import("ink");
	const { render } = inkModule;

	if (cli.flags.dump) {
		try {
			const limitProvided =
				cli.flags.limit !== undefined && cli.flags.limit !== null;
			const parsedLimit = Number(cli.flags.limit);
			const limitIsFinite = Number.isFinite(parsedLimit);

			const fetchOptions = { limit: cli.flags.limit };

			if (!(limitProvided && limitIsFinite)) {
				const lastPage = await findLastPage();
				fetchOptions.lastPage = lastPage;
			}

			const results = await fetchAllEmojis(fetchOptions);
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

	render(
		React.createElement(ui, {
			...cli.flags,
			pageConcurrency,
			downloadConcurrency,
			ink: inkModule,
		}),
	);
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
