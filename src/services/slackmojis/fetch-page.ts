import type { SlackmojiEntry } from "../../types/slackmoji.js";
import { getJsonClient } from "./client.js";

const fetchPage = async (page: number): Promise<SlackmojiEntry[]> => {
	const client = getJsonClient();
	const response = await client.get<SlackmojiEntry[]>("/emojis.json", {
		params: { page: String(page) },
	});
	return Array.isArray(response.data) ? response.data : [];
};

export { fetchPage };
