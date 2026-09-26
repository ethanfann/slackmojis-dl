import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { setTimeout as wait } from "node:timers/promises";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { listEmojiEntries } from "../src/services/filesystem/emoji-inventory.ts";
import { getStreamClient } from "../src/services/slackmojis/client.ts";
import { downloadImage } from "../src/services/slackmojis/download-image.ts";

let directory: string;
let destination: string;
const url = "https://emojis.slackmojis.com/images/parrot.gif";

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "slackmojis-download-"));
	destination = path.join(directory, "parrot.gif");
	vi.spyOn(getStreamClient(), "get").mockRejectedValue(
		new Error("Unexpected request"),
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(directory, { recursive: true, force: true });
});

test("publishes the final filename only after the entire stream succeeds", async () => {
	const body = new PassThrough();
	vi.mocked(getStreamClient().get).mockResolvedValue({
		data: body,
		statusCode: 200,
	});
	const downloading = downloadImage(url, destination);
	body.write("first-");
	await expect.poll(() => fs.readdirSync(directory).length).toBe(1);
	expect(fs.existsSync(destination)).toBe(false);
	expect(listEmojiEntries(directory)).toEqual([]);
	body.end("second");
	expect(await downloading).toBe(destination);
	expect(fs.readFileSync(destination, "utf8")).toBe("first-second");
	expect(fs.readdirSync(directory)).toEqual(["parrot.gif"]);
});

test("removes partial data when a response stream breaks", async () => {
	const body = new PassThrough();
	vi.mocked(getStreamClient().get).mockResolvedValue({
		data: body,
		statusCode: 200,
	});
	const result = expect(
		downloadImage(url, destination, { maxRetries: 0 }),
	).rejects.toThrow(/after 1 attempts/);
	body.write("truncated");
	await expect.poll(() => fs.readdirSync(directory).length).toBe(1);
	body.destroy(new Error("Connection reset"));
	await result;
	expect(fs.readdirSync(directory)).toEqual([]);
});

test("a retry starts with a fresh file rather than appending to the failed response", async () => {
	const broken = Readable.from(
		(async function* () {
			yield "bad prefix";
			throw new Error("Connection reset");
		})(),
	);
	vi.mocked(getStreamClient().get)
		.mockResolvedValueOnce({ data: broken, statusCode: 200 })
		.mockResolvedValueOnce({
			data: Readable.from(["complete image"]),
			statusCode: 200,
		});
	await downloadImage(url, destination, { maxRetries: 1, retryDelayMs: 1 });
	expect(fs.readFileSync(destination, "utf8")).toBe("complete image");
	expect(getStreamClient().get).toHaveBeenCalledTimes(2);
	expect(fs.readdirSync(directory)).toEqual(["parrot.gif"]);
});

test("never truncates an existing image when publication collides", async () => {
	fs.writeFileSync(destination, "existing image");
	vi.mocked(getStreamClient().get).mockResolvedValue({
		data: Readable.from(["replacement"]),
		statusCode: 200,
	});
	await expect(downloadImage(url, destination)).rejects.toMatchObject({
		cause: { code: "EEXIST" },
	});
	expect(fs.readFileSync(destination, "utf8")).toBe("existing image");
	expect(getStreamClient().get).toHaveBeenCalledTimes(1);
	expect(fs.readdirSync(directory)).toEqual(["parrot.gif"]);
});

test("a failed HTTP request cannot delete an existing image", async () => {
	fs.writeFileSync(destination, "existing image");
	await expect(
		downloadImage(url, destination, { maxRetries: 0 }),
	).rejects.toThrow();
	expect(fs.readFileSync(destination, "utf8")).toBe("existing image");
});

test("concurrent downloads publish exactly one whole image without overwriting", async () => {
	vi.mocked(getStreamClient().get)
		.mockResolvedValueOnce({ data: Readable.from(["short"]), statusCode: 200 })
		.mockResolvedValueOnce({
			data: Readable.from(["a much longer image"]),
			statusCode: 200,
		});
	const results = await Promise.allSettled([
		downloadImage(url, destination),
		downloadImage(url, destination),
	]);
	expect(
		results.filter((result) => result.status === "fulfilled"),
	).toHaveLength(1);
	expect(results.filter((result) => result.status === "rejected")).toHaveLength(
		1,
	);
	expect(["short", "a much longer image"]).toContain(
		fs.readFileSync(destination, "utf8"),
	);
	expect(fs.readdirSync(directory)).toEqual(["parrot.gif"]);
});

test("aborting a live stream removes the partial file and never retries", async () => {
	const controller = new AbortController();
	const body = new PassThrough();
	vi.mocked(getStreamClient().get).mockResolvedValue({
		data: body,
		statusCode: 200,
	});
	const result = expect(
		downloadImage(url, destination, { signal: controller.signal }),
	).rejects.toThrow(/cancelled/);
	body.write("partial data");
	await expect.poll(() => fs.readdirSync(directory).length).toBe(1);
	controller.abort(new Error("cancelled"));
	await result;
	expect(getStreamClient().get).toHaveBeenCalledTimes(1);
	expect(getStreamClient().get).toHaveBeenCalledWith(url, {
		signal: controller.signal,
	});
	expect(fs.readdirSync(directory)).toEqual([]);
});

test("cancellation interrupts a retry delay instead of waiting or retrying", async () => {
	vi.spyOn(Math, "random").mockReturnValue(1);
	const controller = new AbortController();
	const result = expect(
		downloadImage(url, destination, {
			retryDelayMs: 10_000,
			signal: controller.signal,
		}),
	).rejects.toThrow();
	await wait(50);
	controller.abort();
	await result;
	expect(getStreamClient().get).toHaveBeenCalledTimes(1);
	expect(fs.readdirSync(directory)).toEqual([]);
});

test("does not publish an empty successful response", async () => {
	vi.mocked(getStreamClient().get).mockResolvedValue({
		data: Readable.from([]),
		statusCode: 200,
	});
	await expect(
		downloadImage(url, destination, { maxRetries: 0 }),
	).rejects.toMatchObject({
		cause: { message: "Received an empty image response." },
	});
	expect(fs.readdirSync(directory)).toEqual([]);
});

test("inventory excludes temporary files, metadata and directories, but keeps real filenames", () => {
	fs.mkdirSync(path.join(directory, "Category.gif"));
	fs.writeFileSync(path.join(directory, ".slackmojis-orphan.part"), "partial");
	fs.writeFileSync(path.join(directory, ".slackmojis-meta.json"), "{}");
	fs.writeFileSync(path.join(directory, ".hidden.gif"), "image");
	fs.writeFileSync(path.join(directory, "extensionless"), "image");
	expect(listEmojiEntries(directory).sort()).toEqual([
		".hidden.gif",
		"extensionless",
	]);
});
