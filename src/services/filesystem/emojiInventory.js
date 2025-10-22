const glob = require("glob");
const path = require("node:path");

const listEmojiEntries = (outputDir) => {
	if (!outputDir) return [];

	const files = glob.sync("**/*.*", { cwd: outputDir });
	return files.map((entry) => path.normalize(entry));
};

module.exports = { listEmojiEntries };
