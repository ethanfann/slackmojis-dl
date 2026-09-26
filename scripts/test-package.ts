#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const run = async (): Promise<void> => {
	const npmCli = process.env.npm_execpath;
	assert(npmCli, "Run this check with npm run test:package.");
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "slackmojis-pack-"),
	);
	const source = path.join(directory, "source");
	const consumer = path.join(directory, "consumer");
	const runNpm = (args: string[], cwd: string) =>
		execFileSync(process.execPath, [npmCli, ...args], {
			cwd,
			encoding: "utf8",
			timeout: 120_000,
		});

	try {
		await fs.mkdir(source);
		await fs.mkdir(consumer);
		for (const entry of [
			"src",
			"data",
			"package.json",
			"package-lock.json",
			"tsconfig.json",
			".gitignore",
			"README.md",
			"LICENSE",
		]) {
			await fs.cp(path.join(root, entry), path.join(source, entry), {
				recursive: true,
			});
		}
		// Reuse the build tools, never an existing dist directory.
		await fs.symlink(
			path.join(root, "node_modules"),
			path.join(source, "node_modules"),
			"junction",
		);
		const [packed] = JSON.parse(
			runNpm(
				[
					"pack",
					"--json",
					"--foreground-scripts=false",
					"--pack-destination",
					directory,
				],
				source,
			),
		) as { filename: string; files: { path: string }[] }[];
		const files = new Set(packed.files.map((file) => file.path));
		for (const required of [
			"dist/cli.js",
			"dist/services/filesystem/write-json.js",
			"data/slackmojis-metadata.json",
			"README.md",
			"LICENSE",
		]) {
			assert(files.has(required), `Package is missing ${required}`);
		}
		assert(![...files].some((file) => /^(src|test|node_modules)\//.test(file)));

		await fs.writeFile(
			path.join(consumer, "package.json"),
			'{"private":true,"type":"module"}\n',
		);
		runNpm(
			[
				"install",
				"--omit=dev",
				"--no-audit",
				"--no-fund",
				path.join(directory, packed.filename),
			],
			consumer,
		);
		const installed = path.join(consumer, "node_modules", "slackmojis-dl");
		const cli = path.join(consumer, "node_modules", ".bin", "slackmojis-dl");
		await fs.access(cli);
		assert(
			(
				await fs.readFile(path.join(installed, "dist/cli.js"), "utf8")
			).startsWith("#!/usr/bin/env node\n"),
		);
		for (const devDependency of ["typescript", "tsx", "vitest"]) {
			await assert.rejects(
				fs.access(path.join(consumer, "node_modules", devDependency)),
				{ code: "ENOENT" },
			);
		}
		const runCli = (args: string[]) =>
			execFileSync(
				process.execPath,
				[path.join(installed, "dist/cli.js"), ...args],
				{
					cwd: consumer,
					env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
					encoding: "utf8",
					timeout: 10_000,
				},
			);
		assert.match(runCli(["--help"]), /Party Parrot/);
		assert.match(runCli(["--limit", "0"]), /Up to Date/);
		runCli(["--dump", "--limit", "0", "--dest", "output"]);
		assert.deepEqual(
			JSON.parse(
				await fs.readFile(path.join(consumer, "output", "emojis.json"), "utf8"),
			),
			[],
		);
		console.log(
			`Package smoke test passed: ${files.size} files, production-only install, bundled categories, download and dump commands (Node ${process.version}).`,
		);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
};

run().catch((error) => {
	console.error("Package smoke test failed", error);
	process.exitCode = 1;
});
