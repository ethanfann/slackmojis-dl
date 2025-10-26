type SlackmojiCategory = {
	name: string;
	[key: string]: unknown;
};

type SlackmojiEntry = {
	name: string;
	image_url: string;
	category: SlackmojiCategory;
	[key: string]: unknown;
};

export type { SlackmojiCategory, SlackmojiEntry };
