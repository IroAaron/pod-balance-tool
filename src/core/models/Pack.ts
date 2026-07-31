export interface PackSourceEntry {
    /** Local-only synthetic id (row key for editing) — never sent on export, the sheet has no per-row key. */
    id: string;

    sourceDeckId: string;

    itemNumber?: number;

    itemCount?: number;

    itemWeight?: number;

    itemCost?: number;
}

export interface Pack {
    id: string;

    cost?: number;

    itemsToTake?: number;

    useWeights?: boolean;

    allowDuplicates?: boolean;

    /** Confirmed unused in real data — shown read-only, never edited or exported. */
    metaTag?: string;

    nameKey: string;

    descKey: string;

    /** One per source-deck row, in order. */
    sources: PackSourceEntry[];
}
