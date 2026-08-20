import { evaluateFormula } from "./formula";
import { BALANCED_COLUMNS, columnAppliesTo, parseNumericCell, type BalancedColumn } from "./rarityBalance";
import type { Item } from "../models/Item";

/** Variables a tier formula can read. `prev`/`base` are the column being computed; the four named ones are the
 *  previous tier's whole row, so a formula can key one parameter off another (`money * 2`, `prev + overheat`). */
export const TIER_FORMULA_VARIABLES = ["prev", "base", "tier", "min", "max", "money", "overheat"] as const;

export interface TierChange {
    itemId: string;
    /** 2 for the first upgrade, 3 for the next — matches how the ids are numbered. */
    tier: number;
    column: BalancedColumn;
    from: string;
    to: string;
}

export interface TierSkip {
    itemId: string;
    column: BalancedColumn;
    reason: string;
}

export interface TierFormulaResult {
    changes: TierChange[];
    skips: TierSkip[];
}

function formatNumber(value: number): string {
    // Trimmed to 4 decimals so a formula like `prev / 3` doesn't write float noise (20.000000000000004) into a
    // sheet that holds plain integers everywhere today.
    return String(Number(value.toFixed(4)));
}

/**
 * Walks each chain from its first tier upwards, deriving every later tier from the one before it.
 *
 * Cascading is the point: with `prev * 2` on a three-tier chain, tier 3 is computed from the tier 2 this same
 * run just produced, not from whatever tier 2 held in the sheet — otherwise changing the growth rate would only
 * ever move the second tier and leave the third stranded at its old ratio.
 *
 * Nothing is written here. The caller previews `changes` first and applies them separately.
 */
export function computeTierUpdates(
    chains: Item[][],
    formulas: Partial<Record<BalancedColumn, string>>
): TierFormulaResult {
    const changes: TierChange[] = [];
    const skips: TierSkip[] = [];

    const activeColumns = BALANCED_COLUMNS.map((entry) => entry.column).filter(
        (column) => (formulas[column] ?? "").trim() !== ""
    );
    if (!activeColumns.length) return { changes, skips };

    for (const chain of chains) {
        if (chain.length < 2) continue;

        const [first] = chain;
        // Values as they stand after this run — read for `prev`, and updated as each tier is computed.
        const running: Record<string, number | null> = {};
        const baseValues: Record<string, number | null> = {};
        for (const entry of BALANCED_COLUMNS) {
            running[entry.column] = parseNumericCell(first.raw[entry.column]);
            baseValues[entry.column] = running[entry.column];
        }

        for (let index = 1; index < chain.length; index++) {
            const target = chain[index];
            const tier = index + 1;
            const nextRunning: Record<string, number | null> = { ...running };

            for (const column of activeColumns) {
                if (!columnAppliesTo(column, target.itemType)) continue;

                const previous = running[column];
                if (previous === null) {
                    skips.push({
                        itemId: target.id,
                        column,
                        reason: `у предыдущего тира «${column}» пустой — не от чего считать`,
                    });
                    continue;
                }

                const result = evaluateFormula(formulas[column] as string, {
                    prev: previous,
                    base: baseValues[column] ?? previous,
                    tier,
                    min: running.ValueMin ?? 0,
                    max: running.ValueMax ?? 0,
                    money: running.MoneyValue ?? 0,
                    overheat: running.Overheat ?? 0,
                });

                if (!result.ok) {
                    skips.push({ itemId: target.id, column, reason: result.error });
                    continue;
                }

                const to = formatNumber(result.value);
                const from = (target.raw[column] ?? "").trim();
                nextRunning[column] = result.value;
                if (from !== to) changes.push({ itemId: target.id, tier, column, from, to });
            }

            // Columns the formulas didn't touch still have to advance, or tier 3 would read tier 1's row.
            for (const entry of BALANCED_COLUMNS) {
                if (!activeColumns.includes(entry.column)) {
                    nextRunning[entry.column] = parseNumericCell(target.raw[entry.column]);
                }
            }
            Object.assign(running, nextRunning);
        }
    }

    return { changes, skips };
}
