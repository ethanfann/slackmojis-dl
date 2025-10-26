import { getBundledMetadata } from "../data/bundled-metadata.js";

const metadata = getBundledMetadata();
const VALID_CATEGORIES = metadata.categories as readonly string[];

const getValidCategories = (): string[] => [...VALID_CATEGORIES];

const isValidCategory = (value: string | null | undefined): boolean => {
	if (typeof value !== "string" || value.trim() === "") {
		return false;
	}

	return VALID_CATEGORIES.includes(value as (typeof VALID_CATEGORIES)[number]);
};

export { getValidCategories, isValidCategory, VALID_CATEGORIES };
