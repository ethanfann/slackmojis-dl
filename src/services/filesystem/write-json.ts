import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const writeJsonAtomically = async (
	filePath: string,
	value: unknown,
): Promise<void> => {
	const payload = `${JSON.stringify(value, null, 2)}\n`;
	const directory = path.dirname(filePath);
	await fs.mkdir(directory, { recursive: true });
	const partialPath = path.join(directory, `.slackmojis-${randomUUID()}.part`);
	try {
		await fs.writeFile(partialPath, payload, { encoding: "utf8", flag: "wx" });
		await fs.rename(partialPath, filePath);
	} finally {
		await fs.rm(partialPath, { force: true });
	}
};

export { writeJsonAtomically };
