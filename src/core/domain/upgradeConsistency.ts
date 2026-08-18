import type { Item } from "../models/Item";
import type { UpgradeChain } from "../models/UpgradeChain";

export interface UpgradeTierDescription {
    item: Item;

    /** Raw description template, exactly as authored — tokens like {ValueOrRange} left unresolved. */
    description: string;

    /** False for the tiers whose text differs from the chain's first tier — the ones worth looking at. */
    matchesFirst: boolean;
}

export interface DescriptionMismatch {
    chainId: string;

    tiers: UpgradeTierDescription[];
}

/**
 * Tiers of one upgrade chain are meant to share a single description *template* — the numbers that differ
 * between them come from tokens ({ValueOrRange}, {MoneyValue}, ...) resolved per-item at render time, not from
 * the text being rewritten. So a chain whose tiers have genuinely different templates is almost always a typo
 * or a half-finished edit, and that's what this finds.
 *
 * Compares the authored text, not the rendered result: two tiers rendering different numbers is correct and
 * expected, while two tiers written with different syntax is the actual defect. Leading/trailing whitespace is
 * ignored — it can't be seen in the UI and is never a deliberate difference — but everything inside the string
 * is compared exactly, so a stray token or a reworded phrase does get reported.
 */
export function findUpgradeDescriptionMismatches(
    chains: UpgradeChain[],
    getItem: (id: string) => Item | undefined,
    describe: (item: Item) => string
): DescriptionMismatch[] {
    const mismatches: DescriptionMismatch[] = [];

    for (const chain of chains) {
        const tiers = chain.itemIds
            .map((id) => getItem(id))
            .filter((item): item is Item => Boolean(item))
            .map((item) => ({ item, description: describe(item).trim() }));

        // A chain with one known tier has nothing to compare against, and one where nobody wrote a description
        // isn't a mismatch — it's just untranslated, which the site already surfaces elsewhere.
        if (tiers.length < 2) continue;
        if (tiers.every((tier) => tier.description === "")) continue;

        const first = tiers[0].description;
        if (tiers.every((tier) => tier.description === first)) continue;

        mismatches.push({
            chainId: chain.id,
            tiers: tiers.map((tier) => ({ ...tier, matchesFirst: tier.description === first })),
        });
    }

    return mismatches;
}
