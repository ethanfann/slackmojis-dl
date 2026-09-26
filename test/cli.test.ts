import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

let directory: string;
const cli = fileURLToPath(new URL("../src/cli.tsx", import.meta.url));
const fixture = new URL("./fixtures/cli-network.ts", import.meta.url).href;

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "slackmojis-cli-"));
});

afterEach(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

const runCli = (
	args: string[],
	scenario = "none",
	interrupt?: NodeJS.Signals,
) =>
	new Promise<{
		code: number | null;
		stdout: string;
		stderr: string;
		signal: NodeJS.Signals | null;
	}>((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				"--import",
				import.meta.resolve("tsx"),
				"--import",
				fixture,
				cli,
				...args,
			],
			{
				cwd: directory,
				env: {
					...process.env,
					CI: "1",
					FORCE_COLOR: "0",
					TSX_TSCONFIG_PATH: fileURLToPath(
						new URL("../tsconfig.json", import.meta.url),
					),
					SLACKMOJIS_TEST_SCENARIO: scenario,
					SLACKMOJIS_DOWNLOAD_MAX_RETRIES: "0",
				},
				stdio: ["ignore", "pipe", "pipe", "ipc"],
				timeout: 10_000,
				killSignal: "SIGKILL",
			},
		);
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.once("message", () => {
			if (interrupt) child.kill(interrupt);
		});
		child.on("close", (code, signal) =>
			resolve({ code, signal, stdout, stderr }),
		);
	});

test.each([
	["--limit", "-1"],
	["--limit", "1.5"],
	["--limit", "Infinity"],
	["--limit", "9007199254740992"],
	["--page-concurrency", "0"],
	["--download-concurrency", "0.5"],
])("rejects invalid %s=%s before networking", async (flag, value) => {
	const result = await runCli([flag, value, "--dump"]);
	expect(result.code).toBe(1);
	expect(result.stderr).toMatch(/integer|greater than zero/);
	expect(result.stderr).not.toContain("at Command");
	expect(fs.readdirSync(directory)).toEqual([]);
});

test("zero limit exits successfully without network requests", async () => {
	const result = await runCli(["--limit", "0"]);
	expect(result.code, result.stderr).toBe(0);
	expect(result.stdout).toContain("Up to Date");
});

test("dump honors destination and category without writing to the working directory", async () => {
	const result = await runCli(
		[
			"--dump",
			"--limit",
			"1",
			"--dest",
			"nested/output",
			"--category",
			"Meme",
			"--page-concurrency",
			"1",
		],
		"dump",
	);
	expect(result.code, result.stderr).toBe(0);
	const output = path.join(directory, "nested/output/emojis.json");
	expect(
		JSON.parse(fs.readFileSync(output, "utf8")).map(
			(entry: { name: string }) => entry.name,
		),
	).toEqual(["meme"]);
	expect(fs.existsSync(path.join(directory, "emojis.json"))).toBe(false);
	expect(fs.readdirSync(path.dirname(output))).toEqual(["emojis.json"]);
});

test("dump respects an explicit single page worker", async () => {
	const result = await runCli(
		["--dump", "--limit", "2", "--page-concurrency", "1"],
		"serial-dump",
	);
	expect(result.code, result.stderr).toBe(0);
	expect(
		JSON.parse(fs.readFileSync(path.join(directory, "emojis.json"), "utf8")),
	).toHaveLength(2);
});

test("a zero-limit dump writes an empty listing without requesting pages", async () => {
	const result = await runCli(["--dump", "--limit", "0"]);
	expect(result.code, result.stderr).toBe(0);
	expect(
		JSON.parse(fs.readFileSync(path.join(directory, "emojis.json"), "utf8")),
	).toEqual([]);
});

test("a failed dump leaves an existing JSON file intact", async () => {
	const output = path.join(directory, "emojis.json");
	fs.writeFileSync(output, '["previous dump"]');
	const result = await runCli(["--dump", "--limit", "1"], "page-error");
	expect(result.code).toBe(1);
	expect(result.stderr).toContain("503");
	expect(fs.readFileSync(output, "utf8")).toBe('["previous dump"]');
});

test("page failures exit nonzero and never render Up to Date", async () => {
	const result = await runCli(["--limit", "1"], "page-error");
	expect(result.code, result.stderr).toBe(1);
	expect(result.stdout).toContain("Failed to complete download");
	expect(result.stdout).not.toContain("Up to Date");
});

test("partial download failures exit nonzero after successful downloads finish", async () => {
	const result = await runCli(["--limit", "1"], "image-error");
	expect(result.code, result.stderr).toBe(1);
	expect(
		fs.existsSync(path.join(directory, "emojis/Party Parrot/parrot.gif")),
	).toBe(false);
	expect(
		fs.readFileSync(path.join(directory, "emojis/Meme/meme.gif"), "utf8"),
	).toBe("image-meme");
	expect(result.stdout).not.toContain("Up to Date");
});

test("successful downloads exit and a repeat run skips existing images", async () => {
	const first = await runCli(["--limit", "1"], "success");
	expect(first.code, first.stderr).toBe(0);
	expect(
		fs.readFileSync(
			path.join(directory, "emojis/Party Parrot/parrot.gif"),
			"utf8",
		),
	).toBe("image-parrot");
	// Listing only: any attempted re-download is an unexpected network request.
	const second = await runCli(["--limit", "1"], "dump");
	expect(second.code, second.stderr).toBe(0);
	expect(second.stdout).toContain("Up to Date");
});

test.each([
	["SIGINT", 130],
	["SIGTERM", 143],
] as const)(
	"%s cancels active streams and exits with %i",
	async (signal, code) => {
		const result = await runCli(
			["--limit", "1", "--download-concurrency", "1"],
			"cancel",
			signal,
		);
		expect(result.signal, result.stderr).toBeNull();
		expect(result.code, result.stderr).toBe(code);
		expect(result.stdout).toContain("cancelled");
		const category = path.join(directory, "emojis/Party Parrot");
		expect(fs.readdirSync(category)).toEqual([]);
	},
);
