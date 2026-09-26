import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
	createEmojiPipeline,
	type EmojiPipelineEvent,
} from "../src/pipeline/emoji-pipeline.ts";

const originalDispatcher = getGlobalDispatcher();
let agent: MockAgent;
let directory: string;
let events: EmojiPipelineEvent[];
const emoji = {
	name: "parrot",
	image_url: "https://emojis.slackmojis.com/images/parrot.gif",
	category: { name: "Party Parrot" },
};

beforeEach(() => {
	agent = new MockAgent();
	agent.disableNetConnect();
	setGlobalDispatcher(agent);
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "slackmojis-pipeline-"));
	events = [];
});

afterEach(async () => {
	try {
		agent.assertNoPendingInterceptors();
	} finally {
		await agent.close();
		setGlobalDispatcher(originalDispatcher);
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

test("drains a slow successful download even when another page fails", async () => {
	agent
		.get("https://slackmojis.com")
		.intercept({ path: "/emojis.json?page=0" })
		.reply(200, [emoji]);
	agent
		.get("https://slackmojis.com")
		.intercept({ path: "/emojis.json?page=1" })
		.reply(503, "Unavailable")
		.delay(10);
	agent
		.get("https://emojis.slackmojis.com")
		.intercept({ path: "/images/parrot.gif" })
		.reply(200, "complete image")
		.delay(50);
	await createEmojiPipeline({
		dest: directory,
		limit: 2,
		pageConcurrency: 2,
		downloadConcurrency: 1,
		onEvent: (event) => events.push(event),
	}).start();
	expect(events.filter((event) => event.type === "error")).toHaveLength(1);
	expect(
		events.filter((event) => event.type === "download-success"),
	).toHaveLength(1);
	expect(events.at(-1)).toEqual({ type: "status", stage: "complete" });
	expect(
		fs.readFileSync(
			path.join(directory, "emojis/Party Parrot/parrot.gif"),
			"utf8",
		),
	).toBe("complete image");
	expect(
		fs.existsSync(path.join(directory, "emojis/.slackmojis-meta.json")),
	).toBe(false);
});

test("does not probe the limit page or store a limit as the actual last page", async () => {
	agent
		.get("https://slackmojis.com")
		.intercept({ path: "/emojis.json?page=0" })
		.reply(200, [emoji]);
	agent
		.get("https://slackmojis.com")
		.intercept({ path: "/emojis.json?page=1" })
		.reply(200, []);
	agent
		.get("https://emojis.slackmojis.com")
		.intercept({ path: "/images/parrot.gif" })
		.reply(200, "image");
	await createEmojiPipeline({
		dest: directory,
		limit: 999,
		pageConcurrency: 1,
		downloadConcurrency: 1,
	}).start();
	const metadata = JSON.parse(
		fs.readFileSync(
			path.join(directory, "emojis/.slackmojis-meta.json"),
			"utf8",
		),
	);
	expect(metadata.lastPage).toBe(0);
});

test("rejects category symlinks that lead outside the output root", async () => {
	const outside = path.join(directory, "outside");
	fs.mkdirSync(outside);
	fs.mkdirSync(path.join(directory, "emojis"));
	fs.symlinkSync(outside, path.join(directory, "emojis/Party Parrot"), "dir");
	agent
		.get("https://slackmojis.com")
		.intercept({ path: "/emojis.json?page=0" })
		.reply(200, [emoji]);
	await createEmojiPipeline({
		dest: directory,
		limit: 1,
		onEvent: (event) => events.push(event),
	}).start();
	expect(
		events.some(
			(event) =>
				event.type === "error" && String(event.error).includes("escapes"),
		),
	).toBe(true);
	expect(fs.readdirSync(outside)).toEqual([]);
});

test("reports a startup filesystem failure once and still settles", async () => {
	const file = path.join(directory, "file");
	fs.writeFileSync(file, "not a directory");
	await expect(
		createEmojiPipeline({
			dest: file,
			onEvent: (event) => events.push(event),
		}).start(),
	).rejects.toThrow();
	expect(events.filter((event) => event.type === "error")).toHaveLength(1);
	expect(events.at(-1)).toEqual({ type: "status", stage: "complete" });
});
