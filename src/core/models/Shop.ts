/**
 * One offer slot in a shop. The ShopSettings sheet is a narrow table — one row per slot, grouped by ShopId —
 * but its two id columns are independent lists that merely share rows: `HousesInShop` holds house packs and
 * `PacksInShop` holds card packs, and a given row may fill either, both, or (for a shop with more houses than
 * card packs, or the reverse) only one.
 */
export interface ShopPackEntry {
    /** Local-only synthetic id (row key for editing) — never sent on export, the sheet has no per-row key. */
    id: string;

    packId: string;

    /** Draw weight, from the `PacksWeights` column. Card packs only — the sheet has no weights for houses. */
    weight?: number;
}

export interface Shop {
    id: string;

    /** House packs offered here, in row order — the `HousesInShop` column. */
    housePacks: ShopPackEntry[];

    /** Card packs offered here with their weights, in row order — `PacksInShop` + `PacksWeights`. */
    cardPacks: ShopPackEntry[];
}
