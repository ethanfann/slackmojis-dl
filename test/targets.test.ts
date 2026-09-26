import path from "node:path";
import { expect, test } from "vitest";
import {
	buildDownloadTargets,
	extractEmojiName,
} from "../src/emoji/build-download-targets.ts";

const emoji = {
	name: "party parrot",
	image_url: "https://emojis.slackmojis.com/images/party%20parrot.gif?123",
	category: { name: "Party Parrot" },
};

test("preserves ordinary category and decoded image names", () => {
	expect(buildDownloadTargets([emoji], null, "output")).toEqual([
		{
			url: emoji.image_url,
			dest: path.join("output", "Party Parrot"),
			name: "party parrot.gif",
			category: "Party Parrot",
		},
	]);
});

test.each(["../../outside", "..\\outside", "/tmp/outside", "..", "bad\0name"])(
	"rejects unsafe category %j instead of writing outside the output directory",
	(name) => {
		expect(() =>
			buildDownloadTargets([{ ...emoji, category: { name } }], null, "output"),
		).toThrow(/unsafe category/i);
	},
);

test.each([
	"%2E%2E%2Fescaped.gif",
	"%2E%2E%5Cescaped.gif",
	"bad%00.gif",
	"%2Fetc%2Ffile.gif",
	"CON.gif",
	"bad.gif.",
])("rejects unsafe decoded image filename %s", (name) => {
	expect(() =>
		extractEmojiName(`https://emojis.slackmojis.com/images/${name}`),
	).toThrow(/unsafe emoji filename/i);
});

test.each([
	"https://untrusted.example/image.gif",
	"https://emojis.slackmojis.com@untrusted.example/image.gif",
	"//untrusted.example/image.gif",
	"file:///tmp/image.gif",
])("rejects unexpected image source %s", (image_url) => {
	expect(() =>
		buildDownloadTargets([{ ...emoji, image_url }], null, "output"),
	).toThrow(/image URL/i);
});
