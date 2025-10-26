const VALID_CATEGORIES = [
	"Among Us",
	"Blob Cats",
	"Cat Emojis",
	"Cowboy Emojis",
	"Dancing Bananas",
	"Facebook Reaction",
	"Game of Thrones",
	"Hangouts Blob",
	"HD Emojis",
	"Jelles Marble Run Teams",
	"Logo",
	"Maybe Finance",
	"Meme",
	"Microsoft Teams",
	"MLB",
	"MLS",
	"NBA",
	"NFL",
	"NHL",
	"NYC Subway",
	"Party Parrot",
	"Piggies",
	"Pokemon",
	"Random",
	"Regional Indicator",
	"Retro Game",
	"Scrabble Letters",
	"Skype",
	"Star Wars",
	"Turntable.fm",
	"Twitch Global",
	"Yahoo Games",
	"Yoyo",
] as const;

const getValidCategories = (): string[] => [...VALID_CATEGORIES];

const isValidCategory = (value: string | null | undefined): boolean => {
	if (typeof value !== "string" || value.trim() === "") {
		return false;
	}

	return VALID_CATEGORIES.includes(value as (typeof VALID_CATEGORIES)[number]);
};

export { getValidCategories, isValidCategory, VALID_CATEGORIES };
