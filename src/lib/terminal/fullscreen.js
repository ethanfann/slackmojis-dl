const enterFullscreen = (stream = process.stdout) => {
	if (!stream || typeof stream.write !== "function" || !stream.isTTY) {
		return () => {};
	}

	let restored = false;

	const write = (sequence) => {
		try {
			stream.write(sequence);
		} catch {
			// Ignore stream write errors (e.g., broken pipe).
		}
	};

	write("\u001b[?1049h"); // Switch to alternate screen buffer
	write("\u001b[H"); // Move cursor to top-left
	write("\u001b[2J"); // Clear screen
	write("\u001b[3J"); // Clear scrollback
	write("\u001b[?25l"); // Hide cursor

	const restore = () => {
		if (restored) {
			return;
		}

		restored = true;
		write("\u001b[?1049l"); // Leave alternate screen buffer
		write("\u001b[?25h"); // Show cursor
	};

	const exitListener = () => {
		restore();
	};

	process.once("exit", exitListener);

	const signalListener = (signal) => {
		restore();
		const exitCode = signal === "SIGINT" ? 130 : 143;
		process.exit(exitCode);
	};

	process.once("SIGINT", signalListener);
	process.once("SIGTERM", signalListener);

	return () => {
		process.off("exit", exitListener);
		process.off("SIGINT", signalListener);
		process.off("SIGTERM", signalListener);
		restore();
	};
};

module.exports = { enterFullscreen };
