export interface SprintRound {
    /** Local-only synthetic id (row key for editing) — never sent on export, the sheet has no per-row key. */
    id: string;

    quota?: number;

    /** 1-indexed stage number — set via the stage board / quick-move select, never free-typed. */
    stage?: number;

    rewardTickets?: number;

    rewardTicketsPerBall?: number;

    /** Pack id — may be blank. */
    rewardPackId?: string;

    /** ShopId — the round's shop, from the `Shops` column. What the shop offers (house packs, card packs and
     *  their weights) lives in ShopSettings; the round only names it. This supersedes housesInShopPackId below,
     *  which could only ever hold one house pack. */
    shopId?: string;

    /**
     * Pack id, from the legacy per-round `HousesInShop` column.
     *
     * Superseded by `shopId`, but still carried and written back verbatim: the engine hasn't moved to reading
     * shops yet, so the column has to keep its current values. Exporting a sprint rewrites its rows whole, so
     * dropping this from the model would have blanked a column the game still depends on. Remove it (here, in
     * normalize and in the export row) once the engine reads ShopSettings and the column is gone from the sheet.
     */
    housesInShopPackId?: string;

    /** Pack id. */
    packDeckStartId?: string;

    /** RoundSettings×9 columns, blanks filtered, order preserved — a pool of candidate Round ids, up to 9 slots. */
    roundIds: string[];
}

export interface Sprint {
    id: string;

    /** Array order IS the RoundNumber order — RoundNumber is never stored, only ever derived from position
     *  (both on screen and at export time). See normalizeSprintsTable's doc for why. */
    rounds: SprintRound[];
}
