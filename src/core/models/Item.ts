export interface Item {
    id: string;

    tags: string[];

    itemType?: string;

    icon?: string;

    nameKey?: string;

    descKey?: string;

    /** The item's own configured value range (ValueMin/ValueMax columns) — undefined if blank/unparseable. */
    valueMin?: number;

    valueMax?: number;

    raw: Record<string, string>;
}
