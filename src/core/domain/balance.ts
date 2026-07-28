import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { MechanicRow } from "../models/Mechanic";
import type { ReplaceRule } from "../models/ReplaceRule";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { BalanceConfig } from "../models/BalanceConfig";
import { computeCascadeLevels } from "./relations";
import type { ItemShopAppearance } from "./shopProbability";

/** Same comma-decimal-tolerant number parsing normalize.ts's parseOptionalNumber uses, but defaulting to 0 (not
 *  undefined) — every term of the power formula treats a missing value as "contributes nothing", not "unknown". */
function parseNumberOr0(value: string | undefined): number {
    const trimmed = (value ?? "").trim();
    if (trimmed === "") return 0;
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isNaN(parsed) ? 0 : parsed;
}

/** Cards/Houses/Artefacts all carry a `MoneyValue` column in the real config — never parsed onto Item itself
 *  (see project memory), so read straight from item.raw here. */
export function moneyValueOf(item: Item): number {
    return parseNumberOr0(item.raw.MoneyValue);
}

/** (ValueMin + ValueMax) / 2 — the item's own configured value range, already parsed onto Item by normalize.ts. */
export function averageValueOf(item: Item): number {
    return ((item.valueMin ?? 0) + (item.valueMax ?? 0)) / 2;
}

export interface BuildPresenceEntry {
    buildId: string;

    buildName: string;

    /** The item's depth in this build's own scaling graph — 0 if it's the build's own root item. See
     *  computeCascadeLevels/computeScalingGraph. */
    depth: number;

    /** balanceConfig.depthCoefficients[depth] at the time this was computed. */
    coefficient: number;
}

export interface ItemPower {
    moneyValue: number;

    averageValue: number;

    /** P — either auto-computed per item from real shop pack/deck data (see domain/shopProbability.ts), or
     *  balanceConfig.scaleChelAppearanceProbability as a fallback when there's no computed value for this item
     *  (not present in any shop deck, or Packs/DecksShop not imported yet). See probabilityIsAuto. */
    probability: number;

    /** True when `probability` came from computeShopAppearanceProbabilities, false when it fell back to the
     *  manual balanceConfig constant. */
    probabilityIsAuto: boolean;

    /** Populated only when probabilityIsAuto — every shop pack that contributed to this item's probability. */
    probabilitySources: { packId: string; deckId: string; withinPackProbability: number }[];

    /** averageValue × (1 + P). */
    probabilityTerm: number;

    /** Every build this item was classified into (with a real depth — see BuildPresenceEntry), and the
     *  coefficient each one contributed. An item that's a member of a build but wasn't reachable in that build's
     *  own scaling graph (computeCascadeLevels' `unclassified`) contributes nothing — there's no "ступень" for it
     *  to look up a coefficient for. */
    buildPresence: BuildPresenceEntry[];

    /** Sum of buildPresence[].coefficient. */
    buildCoefficientSum: number;

    /** averageValue × buildCoefficientSum. */
    buildTerm: number;

    /** (MoneyValue + averageValue) + probabilityTerm + buildTerm. */
    power: number;
}

/**
 * Computes every item's "power" — a single number meant to make relative balance visible at a glance, per the
 * user's own formula:
 *
 *   (MoneyValue + avg) + avg × (1 + P) + avg × Σ(coefficient at this item's depth, once per build it's in)
 *
 * where avg = (ValueMin + ValueMax) / 2, P is per-item — auto-computed from real shop data when `shopAppearances`
 * has an entry for this item (see domain/shopProbability.ts), otherwise balanceConfig.scaleChelAppearanceProbability
 * as a manual fallback — and the per-build coefficient sum comes from classifying the item into each build it
 * belongs to via computeCascadeLevels (the same depth/"ступень" concept already used for the "Дерево связей"
 * build-detail view) and looking up balanceConfig.depthCoefficients[depth] for each one.
 *
 * computeCascadeLevels is run once per build (not once per item×build) — for typical dataset sizes (hundreds of
 * items, dozens of builds) this is cheap enough for a page-level useMemo; callers should still memoize on their
 * own inputs since this recomputes the whole graph for every build on every call.
 */
export function computeItemPowers(
    items: Item[],
    builds: Build[],
    mechanics: MechanicRow[],
    replaceRules: ReplaceRule[],
    upgradeChains: UpgradeChain[],
    balanceConfig: BalanceConfig,
    shopAppearances?: Map<string, ItemShopAppearance>,
    includeMoneyValueRoots = false
): Map<string, ItemPower> {
    const knownIds = new Set(items.map((item) => item.id));
    const presenceByItem = new Map<string, BuildPresenceEntry[]>();

    for (const build of builds) {
        if (build.items.length === 0) continue;

        const result = computeCascadeLevels(build, items, mechanics, replaceRules, includeMoneyValueRoots, {
            upgradeChains,
        });

        for (const node of result.nodes) {
            if (node.combo || !knownIds.has(node.itemId)) continue;

            const coefficient = balanceConfig.depthCoefficients[node.depth] ?? 0;
            const entry: BuildPresenceEntry = { buildId: build.id, buildName: build.name, depth: node.depth, coefficient };
            const list = presenceByItem.get(node.itemId);
            if (list) list.push(entry);
            else presenceByItem.set(node.itemId, [entry]);
        }
    }

    const powers = new Map<string, ItemPower>();

    for (const item of items) {
        const moneyValue = moneyValueOf(item);
        const averageValue = averageValueOf(item);
        const autoAppearance = shopAppearances?.get(item.id);
        const probability = autoAppearance?.perVisitProbability ?? balanceConfig.scaleChelAppearanceProbability;
        const probabilityTerm = averageValue * (1 + probability);
        const buildPresence = presenceByItem.get(item.id) ?? [];
        const buildCoefficientSum = buildPresence.reduce((sum, entry) => sum + entry.coefficient, 0);
        const buildTerm = averageValue * buildCoefficientSum;

        powers.set(item.id, {
            moneyValue,
            averageValue,
            probability,
            probabilityIsAuto: autoAppearance !== undefined,
            probabilitySources: autoAppearance?.packs ?? [],
            probabilityTerm,
            buildPresence,
            buildCoefficientSum,
            buildTerm,
            power: moneyValue + averageValue + probabilityTerm + buildTerm,
        });
    }

    return powers;
}
