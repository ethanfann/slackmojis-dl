#!/usr/bin/env node
const React = require("react");
const meow = require("meow");
const obtain = require("./util/obtain");
const fs = require("node:fs");
const getLastPage = require("./util/getLastPage");

const ui = require("./ui");

const cli = meow(`
	Usage
	  $ ./cli.js
  Options
    --dest  Output directory that defaults to the working directory
    --limit Restrict the number of pages to download
    --dump  Save the emoji listing to ./emojis.json
            Override save location with --path
    --category The category name to download
  Examples
    $ ./cli.js --dest desired/path
    $ ./cli.js --limit=5
    $ ./cli.js --dest desired/path --dump
    $ ./cli.js --category "Hangouts Blob"
`);

const run = async () => {
	const inkModule = await import("ink");
	const { render } = inkModule;

	if (cli.flags.dump) {
		try {
			const lastPage = await getLastPage();
			const results = await obtain(cli.flags.limit, lastPage);
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

	render(React.createElement(ui, { ...cli.flags, ink: inkModule }));
};

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
