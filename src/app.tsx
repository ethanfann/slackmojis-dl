import { defaultTheme, extendTheme, type Theme } from "@inkjs/ui";
import UiApp, { type AppProps as UiAppProps } from "./ui.js";

const buildProgressBarTheme = (): Theme | null => {
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

const App = ({ progressBarTheme, ...rest }: UiAppProps) => (
	<UiApp
		{...rest}
		progressBarTheme={progressBarTheme ?? defaultProgressBarTheme}
	/>
);

export default App;
