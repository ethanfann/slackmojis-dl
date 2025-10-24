import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const glob = require("glob");

const listEmojiEntries = (outputDir) => {
	if (!outputDir) return [];

	const files = glob.sync("**/*.*", { cwd: outputDir });
	return files.map((entry) => path.normalize(entry));
};

export { listEmojiEntries };
