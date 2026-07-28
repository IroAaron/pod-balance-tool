import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { MechanicRow } from "../models/Mechanic";
import type { ReplaceRule } from "../models/ReplaceRule";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { BalanceConfig } from "../models/BalanceConfig";
import { computeCascadeLevels } from "./relations";
import { KNOWN_MECHANIC_TABLES } from "./mechanicTables";
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

    /** P — sum of the shop-appearance probability (see domain/shopProbability.ts) of every "scaler" of this item:
     *  the other members of the build where *this item is the root* (depth ≥ 1 in that build's own scaling
     *  graph — see computeCascadeLevels), i.e. the things that actually scale it. Auto-computed whenever the item
     *  is a real root of at least one build (see probabilityIsAuto); balanceConfig.scaleChelAppearanceProbability
     *  is a manual fallback only for items that are never a build root (pure scalers, or items with no generated
     *  build at all). */
    probability: number;

    /** True when this item is the root (depth 0) of at least one build, so `probability` was computed from its
     *  own scalers' shop data (even if that sum came out to 0 — e.g. real scalers exist but none have shop-deck
     *  data yet). False only when the item was never a build root — probability then falls back to the manual
     *  constant. */
    probabilityIsAuto: boolean;

    /** Populated only when probabilityIsAuto — every scaler item that contributed to this item's P, and that
     *  scaler's own shop-appearance probability. */
    probabilitySources: { itemId: string; buildId: string; buildName: string; probability: number }[];

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

    /** Per-mechanic-table breakdown of the "mechanic power" formula (see mechanicPower) — one entry per table
     *  this item has at least one row of with a real (non-zero) TargetCount, skipped otherwise (same "only real
     *  contributions" convention as buildPresence/probabilitySources). */
    mechanicTerms: MechanicInfluenceEntry[];

    /** MoneyValue + Σ mechanicTerms + buildTerm — the mechanic formula's subtotal *before* being scaled by P (see
     *  mechanicPower). */
    mechanicPowerBeforeProbability: number;

    /** A second, independent power estimate — see computeItemPowers' doc for the full formula. Meant to surface
     *  items that score 0 (or near it) on `power` because they have no MoneyValue/ValueMin/ValueMax at all, but
     *  are still clearly useful because they activate/color/spawn/tag a lot of other things. Scaled by the same P
     *  as `power` (mechanicPowerBeforeProbability × probability) — an item whose scalers are unlikely to actually
     *  show up in a run has its raw mechanical potential discounted accordingly, same reasoning as `power`'s own
     *  avg × (1 + P) term. */
    mechanicPower: number;
}

export interface MechanicInfluenceEntry {
    /** MechanicTableName, e.g. "MechAddValue"/"MechActivate"/... — kept as `string` (not the exact union) so this
     *  module doesn't need to import models/Mechanic.ts just for the type. */
    table: string;

    /** Sum of TargetCount across every row this item has in this mechanic table. */
    targetCountSum: number;

    /** balanceConfig.mechanicInfluence[table] at the time this was computed. */
    influence: number;

    /** targetCountSum × influence — scaled by averageValue as well, but only for the MechAddValue table (the one
     *  mechanic table that's actually about *values*, see computeItemPowers' doc). */
    term: number;
}

/**
 * Computes every item's "power" — a single number meant to make relative balance visible at a glance, per the
 * user's own formula:
 *
 *   (MoneyValue + avg) + avg × (1 + P) + avg × Σ(coefficient at this item's depth, once per build it's in)
 *
 * where avg = (ValueMin + ValueMax) / 2. P and the coefficient sum are two *different* directions through the
 * same build graphs:
 *   - P (term 2) is about this item being scaled: the sum of the shop-appearance probability of every item that
 *     scales *this* item (the other members of the build where this item is the root — see probabilityIsAuto's
 *     doc on ItemPower). Reflects "how reliably will this item actually get boosted in a real run."
 *   - the coefficient sum (term 3) is about this item scaling others: every build this item is a *member* of
 *     (root or not), weighted by balanceConfig.depthCoefficients[depth] for its own depth in each. Reflects "how
 *     useful is this item as a lever for other builds."
 *
 * computeCascadeLevels is run once per build (not once per item×build) — for typical dataset sizes (hundreds of
 * items, dozens of builds) this is cheap enough for a page-level useMemo; callers should still memoize on their
 * own inputs since this recomputes the whole graph for every build on every call.
 *
 * Also computes a second, independent estimate (`mechanicPower`/`mechanicTerms` on ItemPower) — added per the
 * user's own real-world example: an item can have no MoneyValue/ValueMin/ValueMax configured at all (so `power`
 * above reads as ~0, looking "useless") while still mattering a lot because it activates/recolors/spawns/tags
 * many other things. Its formula:
 *
 *   MoneyValue + avg × Σ(TargetCount over this item's MechAddValue rows) × Влияние(MechAddValue)
 *              + Σ(TargetCount over this item's rows of table T) × Влияние(T), for every other mechanic table T
 *              + buildTerm (the same avg × Σ(depth coefficient) term `power` already uses)
 *
 * avg only multiplies the MechAddValue term (the one mechanic table that's actually about *values*) — every other
 * table (MechActivate/MechChangeColor/MechAddItem/MechAddTag) contributes `TargetCount × Влияние(T)` directly, so
 * an item with avg = 0 still scores real mechanicPower from those. Влияние(T) is a per-table constant the user
 * sets in "Константы" (balanceConfig.mechanicInfluence).
 *
 * The whole subtotal above is then multiplied by the item's own P (the exact same value as `power`'s P — sum of
 * the shop-appearance probability of this item's scalers, see ItemPower.probability's doc): items connected to
 * this one by a direct structural edge, cascading down through the scaling graph's tiers. Per the user's own
 * framing — a mechanic's nominal influence only really counts if the chels that make it happen are actually likely
 * to show up in a run.
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

    // itemId -> table -> Σ TargetCount, for the mechanicPower formula. Rows with no/zero TargetCount are simply
    // never added, so a table with nothing real never shows up in an item's map at all.
    const targetCountByItemAndTable = new Map<string, Map<string, number>>();
    for (const row of mechanics) {
        const targetCount = parseNumberOr0(row.fields.TargetCount);
        if (targetCount === 0) continue;

        const byTable = targetCountByItemAndTable.get(row.itemId) ?? new Map<string, number>();
        byTable.set(row.table, (byTable.get(row.table) ?? 0) + targetCount);
        targetCountByItemAndTable.set(row.itemId, byTable);
    }

    const presenceByItem = new Map<string, BuildPresenceEntry[]>();
    // Populated only for items that are the real root (depth 0) of at least one build — distinguishes "root with
    // zero scalers found" (real 0) from "never a root at all" (falls back to the manual constant), see
    // ItemPower.probabilityIsAuto's doc.
    const scalerSourcesByRoot = new Map<string, { itemId: string; buildId: string; buildName: string; probability: number }[]>();

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

        const rootNode = result.nodes.find((node) => node.depth === 0 && !node.combo);
        if (!rootNode) continue;

        const sources = scalerSourcesByRoot.get(rootNode.itemId) ?? [];
        for (const node of result.nodes) {
            if (node.combo || node.itemId === rootNode.itemId) continue;
            const scalerProbability = shopAppearances?.get(node.itemId)?.perVisitProbability;
            if (!scalerProbability) continue;
            sources.push({ itemId: node.itemId, buildId: build.id, buildName: build.name, probability: scalerProbability });
        }
        scalerSourcesByRoot.set(rootNode.itemId, sources);
    }

    const powers = new Map<string, ItemPower>();

    for (const item of items) {
        const moneyValue = moneyValueOf(item);
        const averageValue = averageValueOf(item);
        const scalerSources = scalerSourcesByRoot.get(item.id);
        const probabilityIsAuto = scalerSources !== undefined;
        const probability = probabilityIsAuto
            ? scalerSources.reduce((sum, source) => sum + source.probability, 0)
            : balanceConfig.scaleChelAppearanceProbability;
        const probabilityTerm = averageValue * (1 + probability);
        const buildPresence = presenceByItem.get(item.id) ?? [];
        const buildCoefficientSum = buildPresence.reduce((sum, entry) => sum + entry.coefficient, 0);
        const buildTerm = averageValue * buildCoefficientSum;

        const targetCountByTable = targetCountByItemAndTable.get(item.id);
        const mechanicTerms: MechanicInfluenceEntry[] = [];
        let mechanicTermsSum = 0;
        for (const table of KNOWN_MECHANIC_TABLES) {
            const targetCountSum = targetCountByTable?.get(table) ?? 0;
            if (targetCountSum === 0) continue;

            const influence = balanceConfig.mechanicInfluence[table] ?? 0;
            const factor = table === "MechAddValue" ? averageValue : 1;
            const term = factor * targetCountSum * influence;
            mechanicTerms.push({ table, targetCountSum, influence, term });
            mechanicTermsSum += term;
        }
        const mechanicPowerBeforeProbability = moneyValue + mechanicTermsSum + buildTerm;
        const mechanicPower = mechanicPowerBeforeProbability * probability;

        powers.set(item.id, {
            moneyValue,
            averageValue,
            probability,
            probabilityIsAuto,
            probabilitySources: scalerSources ?? [],
            probabilityTerm,
            buildPresence,
            buildCoefficientSum,
            buildTerm,
            power: moneyValue + averageValue + probabilityTerm + buildTerm,
            mechanicTerms,
            mechanicPowerBeforeProbability,
            mechanicPower,
        });
    }

    return powers;
}
