import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const glob: typeof import("glob") = require("glob");

const listEmojiEntries = (outputDir: string | null | undefined): string[] => {
	if (!outputDir) return [];

	const files = glob.sync("**/*", {
		cwd: outputDir,
		nodir: true,
		dot: true,
		ignore: ["**/.slackmojis-*.part", ".slackmojis-meta.json"],
	});
	return files.map((entry: string) => path.normalize(entry));
};

export { listEmojiEntries };
