import React from "react";

const getStream = (stdout) => {
	if (stdout && typeof stdout.write === "function") {
		return stdout;
	}

	if (process.stdout && typeof process.stdout.write === "function") {
		return process.stdout;
	}

	return null;
};

const readDimensions = (stream) => {
	if (!stream) {
		return { columns: undefined, rows: undefined };
	}

	const columns = Number.isFinite(stream.columns) ? stream.columns : undefined;
	const rows = Number.isFinite(stream.rows) ? stream.rows : undefined;

	return { columns, rows };
};

const useTerminalDimensions = (stdout) => {
	const stream = getStream(stdout);

	const [{ columns, rows }, setDimensions] = React.useState(() =>
		readDimensions(stream),
	);

	React.useEffect(() => {
		const target = getStream(stdout);
		if (!target || typeof target.on !== "function") {
			return undefined;
		}

		const update = () => {
			setDimensions((previous) => {
				const next = readDimensions(target);
				return {
					columns: next.columns ?? previous.columns,
					rows: next.rows ?? previous.rows,
				};
			});
		};

		update();
		target.on("resize", update);

		return () => {
			target.off("resize", update);
		};
	}, [stdout]);

	return { columns, rows };
};

export { useTerminalDimensions };
