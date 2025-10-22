const { getJsonClient } = require("./client");

const fetchPage = async (page) => {
	const client = getJsonClient();
	const response = await client.get("/emojis.json", {
		params: { page: String(page) },
	});
	return response.data;
};

module.exports = { fetchPage };
