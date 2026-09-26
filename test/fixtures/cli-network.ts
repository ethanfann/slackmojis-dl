import { PassThrough } from "node:stream";
import { MockAgent, setGlobalDispatcher } from "undici";
import {
	getJsonClient,
	getStreamClient,
} from "../../src/services/slackmojis/client.ts";

// This preload runs only in CLI subprocess tests. Unexpected network requests
// fail rather than reaching Slackmojis or downloading real images.
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);

const scenario = process.env.SLACKMOJIS_TEST_SCENARIO;
const entries = [
	{
		name: "parrot",
		image_url: "https://emojis.slackmojis.com/images/parrot.gif",
		category: { name: "Party Parrot" },
	},
	{
		name: "meme",
		image_url: "https://emojis.slackmojis.com/images/meme.gif",
		category: { name: "Meme" },
	},
];

if (scenario && scenario !== "none") {
	agent
		.get("https://slackmojis.com")
		.intercept({ path: "/emojis.json?page=0", method: "GET" })
		.reply(
			scenario === "page-error" ? 503 : 200,
			scenario === "page-error"
				? "unavailable"
				: scenario === "empty"
					? []
					: entries,
		);
}

if (scenario === "success" || scenario === "image-error") {
	for (const entry of entries) {
		agent
			.get("https://emojis.slackmojis.com")
			.intercept({ path: new URL(entry.image_url).pathname, method: "GET" })
			.reply(
				scenario === "image-error" && entry.name === "parrot" ? 500 : 200,
				`image-${entry.name}`,
			);
	}
}

if (scenario === "cancel") {
	getStreamClient().get = async () => {
		const body = new PassThrough();
		body.write("unfinished image");
		process.send?.("downloading");
		return { data: body, statusCode: 200 };
	};
}

if (scenario === "serial-dump") {
	agent
		.get("https://slackmojis.com")
		.intercept({ path: "/emojis.json?page=1", method: "GET" })
		.reply(200, []);
	const client = getJsonClient();
	const originalGet = client.get.bind(client);
	let active = false;
	client.get = async (url, config) => {
		if (active) throw new Error("Page concurrency exceeded one");
		active = true;
		try {
			return await originalGet(url, config);
		} finally {
			active = false;
		}
	};
}

process.on("beforeExit", () => agent.assertNoPendingInterceptors());
