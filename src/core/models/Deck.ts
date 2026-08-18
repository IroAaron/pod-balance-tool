export type DeckSource = "Decks" | "DecksShop";

export interface DeckEntry {
    /** Local-only synthetic id (row key for editing) — never sent on export, the sheet has no per-row key. */
    id: string;

    itemId: string;

    weight?: number;

    cost?: number;
}

export interface Deck {
    id: string;

    source: DeckSource;

    /** One per source row, in order — duplicates (repeated itemId) are real data, never deduplicated. */
    entries: DeckEntry[];
}
