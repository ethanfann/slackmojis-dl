import {
	Box,
	type BoxProps,
	type DOMElement,
	measureElement,
	Text,
	type TextProps,
} from "ink";
import React from "react";

export type ProgressBarProps = {
	/**
	 * Progress.
	 * Must be between 0 and 100.
	 *
	 * @default 0
	 */
	readonly value: number;
};

const styles = {
	container: (): BoxProps => ({
		flexGrow: 1,
		minWidth: 0,
	}),
	completed: (): TextProps => ({
		color: "green",
	}),
	remaining: (): TextProps => ({
		dimColor: true,
	}),
};

export function ProgressBar({ value }: ProgressBarProps) {
	const [width, setWidth] = React.useState(0);

	const [ref, setRef] = React.useState<DOMElement | null>(null);

	if (ref) {
		const dimensions = measureElement(ref);

		if (dimensions.width !== width) {
			setWidth(dimensions.width);
		}
	}

	const progress = Math.min(100, Math.max(0, value));
	const complete = Math.round((progress / 100) * width);
	const remaining = width - complete;

	return (
		<Box ref={setRef} {...styles.container()}>
			{complete > 0 && (
				<Text {...styles.completed()}>{"█".repeat(complete)}</Text>
			)}

			{remaining > 0 && (
				<Text {...styles.remaining()}>{"░".repeat(remaining)}</Text>
			)}
		</Box>
	);
}
