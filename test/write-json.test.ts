import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { writeJsonAtomically } from "../src/services/filesystem/write-json.ts";

let directory: string;

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "slackmojis-json-"));
});

afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(directory, { recursive: true, force: true });
});

test("replaces a previous dump with complete JSON and leaves no temporary file", async () => {
	const output = path.join(directory, "emojis.json");
	await fs.writeFile(output, '["old"]');
	await writeJsonAtomically(output, [
		{ name: "new emoji" },
		{ name: "another" },
	]);
	expect(JSON.parse(await fs.readFile(output, "utf8"))).toEqual([
		{ name: "new emoji" },
		{ name: "another" },
	]);
	expect(await fs.readdir(directory)).toEqual(["emojis.json"]);
});

test("a publication failure preserves the original JSON and cleans up the partial file", async () => {
	const output = path.join(directory, "emojis.json");
	await fs.writeFile(output, '["old"]');
	vi.spyOn(fs, "rename").mockRejectedValue(new Error("Permission denied"));
	await expect(writeJsonAtomically(output, ["replacement"])).rejects.toThrow(
		"Permission denied",
	);
	expect(await fs.readFile(output, "utf8")).toBe('["old"]');
	expect(await fs.readdir(directory)).toEqual(["emojis.json"]);
});
