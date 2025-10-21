const axios = require("axios");
const https = require("node:https");
const pjson = require("../../package.json");

let instance;
const SharedAxios = async () => {
	if (!instance) {
		instance = await axios.create({
			baseURL: "https://emojis.slackmojis.com",
			responseType: "stream",
			httpsAgent: new https.Agent({ keepAlive: true }),
			headers: {
				"Content-Type": "application/json",
				"User-Agent": `slackmojis-dl/${pjson.version}`,
			},
		});
	}

	return instance;
};

module.exports = SharedAxios;
