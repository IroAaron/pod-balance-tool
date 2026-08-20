import type { Item } from "../models/Item";

/**
 * Rarity order as the game reads it, weakest first. The Enums sheet lists the same five values; this array is
 * what gives them an *order*, which the sheet can't express and which every comparison here depends on.
 */
export const RARITY_ORDER = ["Base", "Common", "Uncommon", "Rare", "Uniq"] as const;

export type Rarity = (typeof RARITY_ORDER)[number];

/** The columns this page balances. Overheat is absent from the Artefacts sheet, hence `types`. */
export const BALANCED_COLUMNS = [
    { column: "ValueMin", label: "ValueMin", types: ["Card", "House", "Artefact"] },
    { column: "ValueMax", label: "ValueMax", types: ["Card", "House", "Artefact"] },
    { column: "MoneyValue", label: "MoneyValue", types: ["Card", "House", "Artefact"] },
    { column: "Overheat", label: "Overheat", types: ["Card", "House"] },
] as const;

export type BalancedColumn = (typeof BALANCED_COLUMNS)[number]["column"];

/** Whether this item's table actually has the column — writing one it lacks would be dropped by the export. */
export function columnAppliesTo(column: BalancedColumn, itemType: string | undefined): boolean {
    const entry = BALANCED_COLUMNS.find((candidate) => candidate.column === column);
    return entry ? (entry.types as readonly string[]).includes(itemType ?? "Card") : false;
}

/** Reads a sheet cell as a number. Blank is `null` (genuinely unset), not 0 — the difference matters here:
 *  averaging blanks as zeros would drag every rarity's median toward 0 and invent a trend that isn't there. */
export function parseNumericCell(value: string | undefined): number | null {
    const text = (value ?? "").trim();
    if (!text) return null;
    const parsed = Number(text.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
}

export interface RarityStats {
    rarity: string;
    /** How many items of this rarity are in scope at all, including ones with the column left blank. */
    itemCount: number;
    values: number[];
    min: number;
    p25: number;
    median: number;
    p75: number;
    max: number;
    mean: number;
}

/** Nearest-rank percentile on an already-sorted array — no interpolation, so every number shown is a real
 *  value some item actually has, which is what makes the summary checkable against the table below it. */
function percentile(sorted: number[], fraction: number): number {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
    return sorted[index];
}

export function summarizeByRarity(items: Item[], column: BalancedColumn): RarityStats[] {
    const buckets = new Map<string, { values: number[]; itemCount: number }>();

    for (const item of items) {
        if (!columnAppliesTo(column, item.itemType)) continue;
        const rarity = (item.raw.Rarity ?? "").trim() || "—";
        const bucket = buckets.get(rarity) ?? { values: [], itemCount: 0 };
        bucket.itemCount++;
        const value = parseNumericCell(item.raw[column]);
        if (value !== null) bucket.values.push(value);
        buckets.set(rarity, bucket);
    }

    const order = (rarity: string) => {
        const index = (RARITY_ORDER as readonly string[]).indexOf(rarity);
        // Anything unrecognised (including the "—" blank bucket) sorts after the real rarities.
        return index === -1 ? RARITY_ORDER.length : index;
    };

    return [...buckets.entries()]
        .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
        .map(([rarity, bucket]) => {
            const sorted = [...bucket.values].sort((a, b) => a - b);
            const sum = sorted.reduce((total, value) => total + value, 0);
            return {
                rarity,
                itemCount: bucket.itemCount,
                values: sorted,
                min: sorted[0] ?? 0,
                p25: sorted.length ? percentile(sorted, 0.25) : 0,
                median: sorted.length ? percentile(sorted, 0.5) : 0,
                p75: sorted.length ? percentile(sorted, 0.75) : 0,
                max: sorted[sorted.length - 1] ?? 0,
                mean: sorted.length ? sum / sorted.length : 0,
            };
        });
}

export interface RarityTrendIssue {
    rarity: string;
    previousRarity: string;
    kind: "not-increasing" | "overlapping";
    detail: string;
}

/**
 * The actual "is the rarity curve doing its job" check, over the real rarities only (the "—" bucket and any
 * unknown value are skipped — they're a data problem, not a balance one). Two separate complaints, because
 * they call for different fixes:
 *
 *  - `not-increasing`: this rarity's median is no higher than the previous one's. The trend is flat or inverted.
 *  - `overlapping`: the medians do rise, but the p25–p75 bands still sit on top of each other, so a typical
 *    item of this rarity is indistinguishable from a typical item of the previous one. This is the failure a
 *    plain average hides, and it's the one that kills the motivation to open a rarer pack.
 */
export function findTrendIssues(stats: RarityStats[]): RarityTrendIssue[] {
    const real = stats.filter((entry) => (RARITY_ORDER as readonly string[]).includes(entry.rarity) && entry.values.length > 0);
    const issues: RarityTrendIssue[] = [];

    for (let index = 1; index < real.length; index++) {
        const previous = real[index - 1];
        const current = real[index];

        if (current.median <= previous.median) {
            issues.push({
                rarity: current.rarity,
                previousRarity: previous.rarity,
                kind: "not-increasing",
                detail: `медиана ${current.median} не выше, чем у ${previous.rarity} (${previous.median})`,
            });
            continue;
        }

        if (current.p25 < previous.p75) {
            issues.push({
                rarity: current.rarity,
                previousRarity: previous.rarity,
                kind: "overlapping",
                detail: `середина диапазона (${current.p25}–${current.p75}) заходит на ${previous.rarity} (${previous.p25}–${previous.p75})`,
            });
        }
    }

    return issues;
}
