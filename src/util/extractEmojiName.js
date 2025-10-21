const path = require("node:path");
const url = require("node:url");

const extractEmojiName = (emoji_url) => {
	const pathname = url.parse(emoji_url).pathname;
	const basename = path.basename(pathname);

	return decodeURIComponent(basename);
};

module.exports = extractEmojiName;
