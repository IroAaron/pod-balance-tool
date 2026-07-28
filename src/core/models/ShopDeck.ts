/**
 * One row of the DecksShop sheet — an item available in a named "deck" (pool), with its selection weight. Several
 * rows share the same `deckId`; grouped into pools by domain/shopProbability.ts. `id` is a synthetic per-row id
 * (deckId isn't unique either, same reasoning as Pack.id).
 */
export interface ShopDeckEntry {
    id: string;

    deckId: string;

    itemId: string;

    /** Blank in the sheet means "no explicit weight" — treated as 1 (uniform) wherever it matters, see
     *  domain/shopProbability.ts's buildDeckPools. */
    weight?: number;

    cost?: number;
}
