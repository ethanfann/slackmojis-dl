const test = require("ava");
const fs = require("node:fs");
const path = require("node:path");
const nock = require("nock");
const {
	extractEmojiName,
	buildDownloadTargets,
} = require("./src/emoji/buildDownloadTargets");
const { downloadImage } = require("./src/services/slackmojis/downloadImage");
const { fetchPage } = require("./src/services/slackmojis/fetchPage");
const { fetchAllEmojis } = require("./src/services/slackmojis/fetchAllEmojis");
const { listEmojiEntries } = require("./src/services/filesystem/emojiInventory");

/* 
  Temporary Paths
    downloadDir = Used for tests w/ networking to slackmojis.com
    generateDir = Used for tests w/ locally generated files
*/
const tempDir = `${__dirname}/temp`;
const downloadDir = path.join(tempDir, "download");
const generateDir = path.join(tempDir, "generate");

const sampleEmojiPages = {
	0: [
		{
			id: 1,
			name: "party_parrot",
			image_url:
				"https://emojis.slackmojis.com/emojis/images/0000000001/party_parrot.gif",
			category: { id: 1, name: "Party Parrot" },
		},
		{
			id: 2,
			name: "blob_dance",
			image_url:
				"https://emojis.slackmojis.com/emojis/images/0000000002/blob_dance.gif",
			category: { id: 2, name: "Hangouts Blob" },
		},
	],
	1: [
		{
			id: 3,
			name: "dealwithit",
			image_url:
				"https://emojis.slackmojis.com/emojis/images/0000000003/dealwithit.gif",
			category: { id: 3, name: "Meme" },
		},
	],
};

const stubEmojiPage = (page) => {
	const payload = sampleEmojiPages[page] || [];
	nock("https://slackmojis.com")
		.get("/emojis.json")
		.query({ page: String(page) })
		.reply(200, payload);
};

const stubEmojiDownload = (emoji) => {
	const { origin, pathname } = new URL(emoji.image_url);
	nock(origin).get(pathname).reply(200, "gifdata", {
		"Content-Type": "image/gif",
	});
};

test.before(() => {
	nock.disableNetConnect();
});

test.beforeEach(() => {
	nock.cleanAll();
});

test.after.always(() => {
	nock.enableNetConnect();
	nock.cleanAll();
});

// Clean up the temp directories
if (fs.existsSync(downloadDir)) fs.rmSync(downloadDir, { recursive: true });
fs.mkdirSync(downloadDir, { recursive: true });

if (fs.existsSync(generateDir)) fs.rmSync(generateDir, { recursive: true });
fs.mkdirSync(generateDir, { recursive: true });

test("downloads emojis", async (t) => {
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

test("loads existing emojis", async (t) => {
	const range = [...Array(10).keys()];
	const extensions = [".jpg", ".png", ".gif"];

	// Generate 10 media files
	range.forEach((number) => {
		const extension = extensions[Math.floor(Math.random() * 3)];
		fs.openSync(path.join(generateDir, number + extension), "w");
	});

	const existing = listEmojiEntries(generateDir);

	t.is(existing.length === 10, true);
});

test("filter emojis when a category is specified", async (t) => {
	stubEmojiPage(0);
	const results = await fetchPage(0);
	const prepared = buildDownloadTargets(results, "Party Parrot", downloadDir);

	const nonPartyParrot = prepared.filter(
		(emoji) => !emoji.dest.includes("Party Parrot"),
	);

	t.is(nonPartyParrot.length === 0, true);
});

test("obtains single pages of emojis", async (t) => {
	stubEmojiPage(0);
	const results = await fetchPage(0);

	t.is(results.length > 0, true);
});

test("obtains multiple pages of emojis", async (t) => {
	stubEmojiPage(0);
	stubEmojiPage(1);

	const results = await fetchAllEmojis({ limit: 2 });

	t.is(results.length, sampleEmojiPages[0].length + sampleEmojiPages[1].length);
});

test("limit of zero skips fetching pages", async (t) => {
	const results = await fetchAllEmojis({ limit: 0 });

	t.is(results.length, 0);
});

test("fetchAllEmojis stops after encountering an empty page", async (t) => {
	stubEmojiPage(0);
	nock("https://slackmojis.com")
		.get("/emojis.json")
		.query({ page: "1" })
		.reply(200, []);

	const results = await fetchAllEmojis({ concurrency: 1 });

	t.is(results.length, sampleEmojiPages[0].length);
});

test("parse a url to obtain an emoji name", (t) => {
	const name =
		"https://emojis.slackmojis.com/emojis/images/1615690644/20375/0.gif?1615690644";
	const extracted = extractEmojiName(name);

	t.is(extracted, "0.gif");
});
