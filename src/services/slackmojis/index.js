const { fetchPage } = require("./fetchPage");
const { fetchAllEmojis } = require("./fetchAllEmojis");
const { downloadImage } = require("./downloadImage");
const { findLastPage } = require("./findLastPage");
const { resolvePageCount } = require("./resolvePageCount");

module.exports = {
	fetchPage,
	fetchAllEmojis,
	downloadImage,
	findLastPage,
	resolvePageCount,
};
