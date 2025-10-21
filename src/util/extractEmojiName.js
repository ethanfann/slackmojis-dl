const path = require("node:path");
const { URL } = require("node:url");

const extractEmojiName = (emoji_url) => {
	const pathname = new URL(emoji_url).pathname;
	const basename = path.basename(pathname);

	return decodeURIComponent(basename);
};

module.exports = extractEmojiName;
