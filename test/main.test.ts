import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "ava";
import { Agent, MockAgent, setGlobalDispatcher } from "undici";
import {
	buildDownloadTargets,
	extractEmojiName,
} from "../dist/emoji/build-download-targets.js";
import {
	getValidCategories,
	isValidCategory,
} from "../dist/emoji/categories.js";
import { listEmojiEntries } from "../dist/services/filesystem/emoji-inventory.js";
import { downloadImage } from "../dist/services/slackmojis/download-image.js";
import { fetchAllEmojis } from "../dist/services/slackmojis/fetch-all-emojis.js";
import { fetchPage } from "../dist/services/slackmojis/fetch-page.js";
import type { SlackmojiEntry } from "../src/types/slackmoji.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

/*
	Temporary Paths
	 downloadDir = Used for tests w/ networking to slackmojis.com
	 generateDir = Used for tests w/ locally generated files
*/
const tempDir = path.join(projectRoot, "temp");
const downloadDir = path.join(tempDir, "download");
const generateDir = path.join(tempDir, "generate");
const mockAgent = new MockAgent();
const slackmojisPool = mockAgent.get("https://slackmojis.com");
const emojiCdnPool = mockAgent.get("https://emojis.slackmojis.com");

const sampleEmojiPages: Record<number, SlackmojiEntry[]> = {
	0: [
		{
			id: 1,
			name: "party_parrot",
			image_url:
				"https://emojis.slackmojis.com/emojis/images/0000000001/party_parrot.gif",
			category: { id: 1, name: "Party Parrot" },
		} as SlackmojiEntry,
		{
			id: 2,
			name: "blob_dance",
			image_url:
				"https://emojis.slackmojis.com/emojis/images/0000000002/blob_dance.gif",
			category: { id: 2, name: "Hangouts Blob" },
		} as SlackmojiEntry,
	],
	1: [
		{
			id: 3,
			name: "dealwithit",
			image_url:
				"https://emojis.slackmojis.com/emojis/images/0000000003/dealwithit.gif",
			category: { id: 3, name: "Meme" },
		} as SlackmojiEntry,
	],
};

const stubEmojiPage = (page: number): void => {
	const payload = sampleEmojiPages[page] ?? [];
	slackmojisPool
		.intercept({
			method: "GET",
			path: `/emojis.json?page=${page}`,
		})
		.reply(200, payload, {
			headers: { "Content-Type": "application/json" },
		});
};

const stubEmojiDownload = (emoji: SlackmojiEntry): void => {
	const { pathname, search } = new URL(emoji.image_url);
	emojiCdnPool
		.intercept({
			method: "GET",
			path: `${pathname}${search ?? ""}`,
		})
		.reply(200, "gifdata", {
			headers: { "Content-Type": "image/gif" },
		});
};

test.before(() => {
	mockAgent.disableNetConnect();
	setGlobalDispatcher(mockAgent);
});

test.beforeEach(() => {
	mockAgent.assertNoPendingInterceptors();
});

test.afterEach.always(() => {
	mockAgent.assertNoPendingInterceptors();
});

test.after.always(async () => {
	mockAgent.enableNetConnect();
	await mockAgent.close();
	setGlobalDispatcher(
		new Agent({
			connectTimeout: 30_000,
			bodyTimeout: 30_000,
			headersTimeout: 30_000,
		}),
	);
});

// Clean up the temp directories
if (fs.existsSync(downloadDir)) fs.rmSync(downloadDir, { recursive: true });
fs.mkdirSync(downloadDir, { recursive: true });

if (fs.existsSync(generateDir)) fs.rmSync(generateDir, { recursive: true });
fs.mkdirSync(generateDir, { recursive: true });

test.serial("downloads emojis", async (t) => {
	stubEmojiPage(0);
	const emojiFromFirstPage = sampleEmojiPages[0][0];
	stubEmojiDownload(emojiFromFirstPage);

	const results = await fetchPage(0);
	const prepared = buildDownloadTargets(results, null, downloadDir);

	const emoji = prepared[0];
	if (!fs.existsSync(emoji.dest)) fs.mkdirSync(emoji.dest, { recursive: true });
	await downloadImage(emoji.url, path.join(emoji.dest, emoji.name));

	t.is(listEmojiEntries(downloadDir).length === 1, true);
});

test.serial("loads existing emojis", (t) => {
	const range = [...Array(10).keys()];
	const extensions = [".jpg", ".png", ".gif"];

	// Generate 10 media files
	range.forEach((number) => {
		const extension = extensions[Math.floor(Math.random() * 3)] ?? ".gif";
		const descriptor = fs.openSync(
			path.join(generateDir, `${number}${extension}`),
			"w",
		);
		fs.closeSync(descriptor);
	});

	const existing = listEmojiEntries(generateDir);

	t.is(existing.length === 10, true);
});

test.serial("filter emojis when a category is specified", async (t) => {
	stubEmojiPage(0);
	const results = await fetchPage(0);
	const prepared = buildDownloadTargets(results, "Party Parrot", downloadDir);

	const nonPartyParrot = prepared.filter(
		(emoji) => !emoji.dest.includes("Party Parrot"),
	);

	t.is(nonPartyParrot.length === 0, true);
});

test.serial("obtains single pages of emojis", async (t) => {
	stubEmojiPage(0);
	const results = await fetchPage(0);

	t.is(results.length > 0, true);
});

test.serial("obtains multiple pages of emojis", async (t) => {
	stubEmojiPage(0);
	stubEmojiPage(1);

	const results = await fetchAllEmojis({ limit: 2 });

	t.is(results.length, sampleEmojiPages[0].length + sampleEmojiPages[1].length);
});

test.serial("limit of zero skips fetching pages", async (t) => {
	const results = await fetchAllEmojis({ limit: 0 });

	t.is(results.length, 0);
});

test.serial(
	"fetchAllEmojis stops after encountering an empty page",
	async (t) => {
		stubEmojiPage(0);
		slackmojisPool
			.intercept({
				method: "GET",
				path: "/emojis.json?page=1",
			})
			.reply(200, [], {
				headers: { "Content-Type": "application/json" },
			});

		const results = await fetchAllEmojis({ concurrency: 1 });

		t.is(results.length, sampleEmojiPages[0].length);
	},
);

test("valid categories mirror bundled metadata", (t) => {
	const metadataPath = path.join(projectRoot, "data", "slackmojis-metadata.json");
	const raw = JSON.parse(
		fs.readFileSync(metadataPath, "utf8"),
	) as { categories?: string[] };
	const expectedCategories = Array.isArray(raw.categories) ? raw.categories : [];

	t.deepEqual(getValidCategories(), expectedCategories);
});

test("isValidCategory only accepts known categories", (t) => {
	const categories = getValidCategories();
	const sample = categories[0] ?? "Party Parrot";
	t.true(isValidCategory(sample));
	t.false(isValidCategory("Not Real Category"));
	t.false(isValidCategory(""));
});

test.serial("parse a url to obtain an emoji name", (t) => {
	const name =
		"https://emojis.slackmojis.com/emojis/images/1615690644/20375/0.gif?1615690644";
	const extracted = extractEmojiName(name);

	t.is(extracted, "0.gif");
});
