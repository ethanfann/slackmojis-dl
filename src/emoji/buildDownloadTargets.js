const path = require("node:path");

const extractEmojiName = (emojiUrl) => {
	try {
		const parsed = new URL(emojiUrl);
		return decodeURIComponent(path.basename(parsed.pathname));
	} catch {
		return decodeURIComponent(path.basename(emojiUrl));
	}
};

const buildDownloadTargets = (emojis, categoryFilter, outputDir) => {
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
			return {
				url: emoji.image_url,
				dest: path.join(outputDir, category),
				name: extractEmojiName(emoji.image_url),
				category,
			};
		});
};

module.exports = { buildDownloadTargets, extractEmojiName };
