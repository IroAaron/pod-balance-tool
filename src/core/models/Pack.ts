/**
 * A shop/pack entry (Packs sheet) — draws `itemNumber` items (with or without repeats, see `allowDuplicates`)
 * from the deck named by `sourceDeckId` (see ShopDeck.ts), of which the player may keep `itemsToTake`. `packId`
 * is NOT unique across rows — e.g. real `start_deck` has 3 rows (one per starting-character-deck option) — so
 * `id` is a synthetic per-row id, same convention as MechanicRow/ReplaceRule.
 */
export interface Pack {
    id: string;

    packId: string;

    cost?: number;

    itemsToTake?: number;

    sourceDeckId: string;

    /** When falsy, ShopDeckEntry.weight is ignored entirely and every entry in the source deck is treated as
     *  equally likely — literally what the sheet's own column means, per its Russian header comment. */
    useWeights?: boolean;

    /** When true, the same item can be drawn more than once among itemNumber draws (sampling with replacement). */
    allowDuplicates?: boolean;

    /** How many items get drawn from the source deck into this pack's basket. */
    itemNumber?: number;

    itemCount?: number;

    itemWeight?: number;

    itemCost?: number;
}
