import { defaultTheme, extendTheme } from "@inkjs/ui";
import React from "react";
import UiApp from "./ui.js";

const buildProgressBarTheme = () => {
	if (typeof extendTheme !== "function" || !defaultTheme) {
		return defaultTheme ?? null;
	}

	return extendTheme(defaultTheme, {
		components: {
			ProgressBar: {
				styles: {
					completed: () => ({
						color: "green",
					}),
				},
			},
		},
	});
};

const defaultProgressBarTheme = buildProgressBarTheme();

const App = (props) => {
	const { progressBarTheme, ...rest } = props;

	return React.createElement(UiApp, {
		...rest,
		progressBarTheme: progressBarTheme ?? defaultProgressBarTheme,
	});
};

export default App;
