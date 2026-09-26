import type { SlackmojiEntry } from "../../types/slackmoji.js";
import { getJsonClient } from "./client.js";

const isEmojiEntry = (value: unknown): value is SlackmojiEntry => {
	if (!value || typeof value !== "object") return false;
	const entry = value as Partial<SlackmojiEntry>;
	return (
		typeof entry.name === "string" &&
		typeof entry.image_url === "string" &&
		entry.image_url.trim().length > 0 &&
		typeof entry.category?.name === "string" &&
		entry.category.name.trim().length > 0
	);
};

const fetchPage = async (
	page: number,
	signal?: AbortSignal,
): Promise<SlackmojiEntry[]> => {
	const client = getJsonClient();
	const response = await client.get<unknown>("/emojis.json", {
		params: { page: String(page) },
		signal,
	});
	if (!Array.isArray(response.data) || !response.data.every(isEmojiEntry)) {
		throw new Error(
			`Invalid emoji listing on page ${page}: expected an array of emoji entries.`,
		);
	}
	return response.data;
};

export { fetchPage };
