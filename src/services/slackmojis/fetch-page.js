import { getJsonClient } from "./client.js";

const fetchPage = async (page) => {
	const client = getJsonClient();
	const response = await client.get("/emojis.json", {
		params: { page: String(page) },
	});
	return response.data;
};

export { fetchPage };
