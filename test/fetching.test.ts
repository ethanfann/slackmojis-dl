import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, expect, test } from "vitest";
import { fetchAllEmojis } from "../src/services/slackmojis/fetch-all-emojis.ts";
import { fetchPage } from "../src/services/slackmojis/fetch-page.ts";
import { findLastPage } from "../src/services/slackmojis/find-last-page.ts";

const originalDispatcher = getGlobalDispatcher();
let agent: MockAgent;

const entry = (page: number) => ({
	name: `emoji-${page}`,
	image_url: `https://emojis.slackmojis.com/images/${page}.gif`,
	category: { name: "Meme" },
});

const reply = (page: number, payload: unknown, delay = 0) => {
	const scope = agent
		.get("https://slackmojis.com")
		.intercept({ path: `/emojis.json?page=${page}`, method: "GET" })
		.reply(200, JSON.stringify(payload));
	if (delay > 0) scope.delay(delay);
};

beforeEach(() => {
	agent = new MockAgent();
	agent.disableNetConnect();
	setGlobalDispatcher(agent);
});

afterEach(async () => {
	try {
		agent.assertNoPendingInterceptors();
	} finally {
		await agent.close();
		setGlobalDispatcher(originalDispatcher);
	}
});

test.each(
	[
		null,
		{ error: "temporarily unavailable" },
		[null],
		[{}],
		[{ ...entry(0), image_url: 17 }],
	].map((payload) => [payload]),
)(
	"rejects malformed successful responses instead of treating them as EOF: %j",
	async (payload) => {
		reply(3, payload);
		await expect(fetchPage(3)).rejects.toThrow(/page 3/i);
	},
);

test("only an empty array is the end of the listing", async () => {
	reply(1, []);
	expect(await fetchPage(1)).toEqual([]);
});

test("continues beyond a stale bundled last-page hint", async () => {
	for (let page = 0; page <= 200; page += 1) {
		reply(page, [entry(page)]);
	}
	reply(201, []);
	const results = await fetchAllEmojis({ lastPageHint: 199, concurrency: 1 });
	expect(results.map((emoji) => emoji.name)).toEqual(
		Array.from({ length: 201 }, (_, page) => `emoji-${page}`),
	);
});

test("preserves page order and excludes speculative results past the first empty page", async () => {
	reply(0, [entry(0)], 30);
	reply(1, [entry(1)], 5);
	reply(2, []);
	reply(3, [entry(3)], 10);
	expect(await fetchAllEmojis({ concurrency: 4 })).toEqual([
		entry(0),
		entry(1),
	]);
});

test("an explicit limit overrides a larger hint without requesting extra pages", async () => {
	reply(0, [entry(0)]);
	reply(1, [entry(1)]);
	expect(
		await fetchAllEmojis({ limit: 2, lastPageHint: 999, concurrency: 3 }),
	).toEqual([entry(0), entry(1)]);
});

test("waits for in-flight workers and stops scheduling after a page error", async () => {
	reply(0, [entry(0)], 30);
	agent
		.get("https://slackmojis.com")
		.intercept({ path: "/emojis.json?page=1", method: "GET" })
		.reply(503, "unavailable");
	await expect(fetchAllEmojis({ concurrency: 2 })).rejects.toThrow(/503/);
});

test.each([0, 1, 3, 9])(
	"discovers last page %i even with an oversized hint",
	async (lastPage) => {
		agent
			.get("https://slackmojis.com")
			.intercept({ path: /\/emojis.json\?page=\d+/, method: "GET" })
			.reply((options) => {
				const page = Number(
					new URL(options.path, "https://slackmojis.com").searchParams.get(
						"page",
					),
				);
				return {
					statusCode: 200,
					data: JSON.stringify(page <= lastPage ? [entry(page)] : []),
				};
			})
			.persist();
		expect(await findLastPage({ floor: 199 })).toBe(lastPage);
	},
);
