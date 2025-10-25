import fs from "node:fs/promises";
import path from "node:path";

type RunMetadata = {
	lastPage?: number;
	updatedAt?: string;
	[key: string]: unknown;
};

const METADATA_FILENAME = ".slackmojis-meta.json";

const metadataPath = (outputDir: string): string =>
	path.join(outputDir, METADATA_FILENAME);

const readRunMetadata = async (
	outputDir: string,
): Promise<RunMetadata | null> => {
	try {
		const filePath = metadataPath(outputDir);
		const contents = await fs.readFile(filePath, "utf8");
		return JSON.parse(contents) as RunMetadata;
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			return null;
		}

		throw error;
	}
};

const writeRunMetadata = async (
	outputDir: string,
	metadata: RunMetadata,
): Promise<void> => {
	const filePath = metadataPath(outputDir);
	const payload = {
		...metadata,
		updatedAt: new Date().toISOString(),
	};

	await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

export { readRunMetadata, writeRunMetadata };
export type { RunMetadata };
