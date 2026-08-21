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
     *  their weights) lives in ShopSettings; the round only names it. Replaced the old per-round HousesInShop
     *  column, which could only ever hold one house pack. */
    shopId?: string;

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
