const { fetchPage } = require("./fetchPage");
const { fetchAllEmojis } = require("./fetchAllEmojis");
const { downloadImage } = require("./downloadImage");
const { findLastPage } = require("./findLastPage");
const { resolveLastPageHint, MIN_LAST_PAGE_INDEX } = require("./lastPageHint");

module.exports = {
	fetchPage,
	fetchAllEmojis,
	downloadImage,
	findLastPage,
	resolveLastPageHint,
	MIN_LAST_PAGE_INDEX,
};
