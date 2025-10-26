import path from "node:path";
import type { SlackmojiEntry } from "../types/slackmoji.js";

const extractEmojiName = (emojiUrl: string): string => {
	try {
		const parsed = new URL(emojiUrl);
		return decodeURIComponent(path.basename(parsed.pathname));
	} catch {
		return decodeURIComponent(path.basename(emojiUrl));
	}
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
