import { getBundledMetadata } from "../../data/bundled-metadata.js";

const metadata = getBundledMetadata();
const MIN_LAST_PAGE_INDEX =
	Number.isFinite(metadata.lastPage) && metadata.lastPage >= 0
		? Math.floor(metadata.lastPage)
		: 0;

const resolveLastPageHint = async (): Promise<number> => MIN_LAST_PAGE_INDEX;

export { resolveLastPageHint, MIN_LAST_PAGE_INDEX };
