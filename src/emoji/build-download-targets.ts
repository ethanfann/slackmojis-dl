import path from "node:path";
import type { SlackmojiEntry } from "../types/slackmoji.js";

const assertSafeSegment = (value: string, label: string): void => {
	const hasControlCharacters = Array.from(value).some(
		(character) =>
			character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
	);
	if (
		!value.trim() ||
		value === "." ||
		value === ".." ||
		/[\\/<>:"|?*]/.test(value) ||
		/[. ]$/.test(value) ||
		/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) ||
		hasControlCharacters
	) {
		throw new Error(`Unsafe ${label}: ${JSON.stringify(value)}`);
	}
};

const extractEmojiName = (emojiUrl: string): string => {
	let parsed: URL;
	try {
		parsed = new URL(emojiUrl);
	} catch {
		throw new Error(`Invalid image URL: ${JSON.stringify(emojiUrl)}`);
	}
	if (
		parsed.origin !== "https://emojis.slackmojis.com" ||
		parsed.username ||
		parsed.password
	) {
		throw new Error(`Unexpected image URL: ${JSON.stringify(emojiUrl)}`);
	}

	const name = decodeURIComponent(parsed.pathname.split("/").at(-1) ?? "");
	assertSafeSegment(name, "emoji filename");
	return name;
};

type DownloadTarget = {
	url: string;
	dest: string;
	name: string;
	category: string;
};

const buildDownloadTargets = (
	emojis: SlackmojiEntry[],
	categoryFilter: string | null | undefined,
	outputDir: string,
): DownloadTarget[] => {
	if (!Array.isArray(emojis) || emojis.length === 0) {
		return [];
	}

	return emojis
		.filter((emoji) => {
			if (!emoji?.category?.name) {
				return false;
			}

			if (categoryFilter) {
				return emoji.category.name === categoryFilter;
			}

			return true;
		})
		.map((emoji) => {
			const category = emoji.category.name;
			assertSafeSegment(category, "category");
			const url = String(emoji.image_url ?? "");
			return {
				url,
				dest: path.join(outputDir, category),
				name: extractEmojiName(url),
				category,
			};
		})
		.filter(
			(emoji): emoji is DownloadTarget =>
				typeof emoji.name === "string" &&
				emoji.name.trim() !== "" &&
				emoji.name !== "." &&
				emoji.url.trim() !== "",
		);
};

export { buildDownloadTargets, extractEmojiName };
export type { DownloadTarget };
