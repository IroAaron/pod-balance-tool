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
     *  members of the build where *this item is the root* that have a **direct** structural edge to it — depth
     *  exactly 1 in that build's own scaling graph (see computeCascadeLevels), not deeper/indirect ones. Auto-
     *  computed whenever the item is a real root of at least one build (see probabilityIsAuto);
     *  balanceConfig.scaleChelAppearanceProbability is a manual fallback only for items that are never a build
     *  root (pure scalers, or items with no generated build at all). */
    probability: number;

    /** True when this item is the root (depth 0) of at least one build, so `probability` was computed from its
     *  own scalers' shop data (even if that sum came out to 0 — e.g. real scalers exist but none have shop-deck
     *  data yet). False only when the item was never a build root — probability then falls back to the manual
     *  constant. */
    probabilityIsAuto: boolean;

    /** Populated only when probabilityIsAuto — every scaler item that contributed to this item's P, and that
     *  scaler's own shop-appearance probability. */
    probabilitySources: { itemId: string; buildId: string; buildName: string; probability: number }[];

    /** Every build this item was classified into (with a real depth — see BuildPresenceEntry), and the
     *  coefficient each one contributed. An item that's a member of a build but wasn't reachable in that build's
     *  own scaling graph (computeCascadeLevels' `unclassified`) contributes nothing — there's no "ступень" for it
     *  to look up a coefficient for. Still used by `mechanicPower` (not `power` — see computeItemPowers' doc). */
    buildPresence: BuildPresenceEntry[];

    /** Sum of buildPresence[].coefficient. */
    buildCoefficientSum: number;

    /** averageValue × buildCoefficientSum — only feeds `mechanicPower` now, not `power`. */
    buildTerm: number;

    /** M — count of unique items this item has a *direct* structural connection with (both directions: things
     *  it directly feeds, and things that directly feed it), across every build it's a member of at all (not
     *  just the ones in `qualifyingBuildEntries`/S). See computeItemPowers' doc for the full `power` formula. */
    directConnectionsCount: number;

    /** S — the subset of `buildPresence` where this item's own depth is ≤
     *  balanceConfig.qualifyingBuildDepthThreshold (N), each paired with that build's own Q (root's MoneyValue +
     *  MainValue) and V (this item's depth coefficient in that build — same value as the matching
     *  buildPresence[].coefficient). */
    qualifyingBuildEntries: { buildId: string; buildName: string; depth: number; q: number; v: number; product: number }[];

    /** qualifyingBuildEntries.length — |S|. */
    qualifyingBuildCount: number;

    /** Σ(Q × V) over qualifyingBuildEntries. */
    sumQV: number;

    /** A — total number of items in the dataset `power` was computed over. */
    totalItemCount: number;

    /** |S| × (M + 1) / A. */
    formulaMultiplier: number;

    /** (MoneyValue + MainValue) + formulaMultiplier × sumQV — see computeItemPowers' doc for the full formula. */
    power: number;

    /** Per-mechanic-table breakdown of the "mechanic power" formula (see mechanicPower) — one entry per table
     *  this item has at least one row of with a real (non-zero) TargetCount, skipped otherwise (same "only real
     *  contributions" convention as buildPresence/probabilitySources). */
    mechanicTerms: MechanicInfluenceEntry[];

    /** Σ mechanicTerms — the raw sum of every table's TargetCount × Влияние term, *before* being boosted by P (see
     *  mechanicPower). */
    mechanicTermsSum: number;

    /** mechanicTermsSum × (1 + P) — see mechanicPower's doc for why (1 + P), not a bare × P. */
    mechanicTermsWithProbability: number;

    /** A second, independent power estimate, unrelated to `power`'s own (S/M/Q/V) formula — see computeItemPowers'
     *  doc for the full formula. Meant to surface items that score 0 (or near it) on `power` because they have no
     *  MoneyValue/ValueMin/ValueMax at all, but are still clearly useful because they activate/color/spawn/tag a
     *  lot of other things. Only the mechanic terms are boosted by `(1 + P)`, never a bare `× P`: a bare `× P`
     *  would zero out the whole formula whenever an item has no known scalers (P = 0), which is both common (most
     *  items are never a build root) and wrong — an item's raw mechanical influence is real even with no scalers,
     *  P should only ever add a *bonus* on top, never erase the baseline. MoneyValue and buildTerm are left
     *  untouched by P. */
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
 *   (MoneyValue + MainValue) + (|S| × (M + 1) / A) × Σ_{b∈S}(Q_b × V_b)
 *
 * where, for the item X whose power is being computed:
 *   - MoneyValue/MainValue are X's own values (MainValue = (ValueMin + ValueMax) / 2, same quantity the rest of
 *     this module calls `averageValue`/avg — "MainValue" is the game's own name for it, see TargetValueType).
 *   - S is the subset of builds X is a member of (from `buildPresence`) where X's own depth is ≤
 *     balanceConfig.qualifyingBuildDepthThreshold (N) — "билды, в которых предмет находится не ниже N ступени".
 *   - M is the count of unique items X has a *direct* structural connection with — both directions (things X
 *     directly feeds, and things that directly feed X), across *every* build X is a member of at all, not just
 *     the ones in S. Computed from computeCascadeLevels' `node.parents` (an edge child→parent in the BFS sense is
 *     a direct connection either way you look at it).
 *   - Q_b, for a qualifying build b, is that build's own root item's MoneyValue + MainValue (not X's — the
 *     build's head item, which is X itself only when X happens to be that build's root).
 *   - V_b is X's own depthCoefficients[depth] in build b — literally the same value as
 *     buildPresence.find(e => e.buildId === b).coefficient.
 *   - A is the total number of items `power` was computed over (the full `items` array).
 *
 * This fully replaced an earlier formula ((MoneyValue + avg) + avg × (1 + P) + avg × Σ(depth coefficient)) per
 * explicit request — P (still computed, see ItemPower.probability) and the depth-coefficient sum (buildTerm) are
 * no longer part of `power` at all, but both still feed `mechanicPower` below.
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
 *   MoneyValue + [Σ(TargetCount over this item's MechAddValue rows) × Влияние(MechAddValue) × avg
 *              +  Σ(TargetCount over this item's rows of table T) × Влияние(T), for every other mechanic table T]
 *                 × (1 + P)
 *              + buildTerm (the same avg × Σ(depth coefficient) term `power` already uses)
 *
 * avg only multiplies the MechAddValue term (the one mechanic table that's actually about *values*) — every other
 * table (MechActivate/MechChangeColor/MechAddItem/MechAddTag) contributes `TargetCount × Влияние(T)` directly, so
 * an item with avg = 0 still scores real mechanicPower from those. Влияние(T) is a per-table constant the user
 * sets in "Константы" (balanceConfig.mechanicInfluence).
 *
 * Only the mechanic-terms sum is boosted by `(1 + P)` — P is the sum of the shop-appearance probability of this
 * item's direct scalers, see ItemPower.probability's doc (computed independently of `power`'s own S/M/Q/V formula
 * above, but still shared between both). `(1 + P)`, not a bare `× P`: an earlier version multiplied the *whole*
 * subtotal by P, which zeroed mechanicPower out entirely for any item with no known scalers (P = 0) — common, and
 * wrong, since the point of this formula is precisely to credit items whose value comes from their own mechanics
 * rather than from being scaled. `(1 + P)` means P only ever adds a bonus, the baseline mechanic influence always
 * survives.
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
    const itemsById = new Map(items.map((item) => [item.id, item]));

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

    // buildId -> that build's own root item id — for `power`'s Q_b (the build's root's MoneyValue + MainValue).
    const rootItemIdByBuild = new Map<string, string>();

    // itemId -> Set of unique items with a direct structural edge to it, either direction — for `power`'s M. A
    // single undirected adjacency map built once across every build, since M is defined "across every build the
    // item is in at all", not scoped to S.
    const directNeighborsByItem = new Map<string, Set<string>>();
    function addDirectNeighbor(a: string, b: string): void {
        if (a === b) return;
        const set = directNeighborsByItem.get(a) ?? new Set<string>();
        set.add(b);
        directNeighborsByItem.set(a, set);
    }

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

            // Every parent edge is a direct connection, counted both ways (see directNeighborsByItem's doc) —
            // parents pointing at a combo node or an id outside `items` are simply not real items, skipped.
            for (const parent of node.parents) {
                if (!knownIds.has(parent.itemId)) continue;
                addDirectNeighbor(node.itemId, parent.itemId);
                addDirectNeighbor(parent.itemId, node.itemId);
            }
        }

        const rootNode = result.nodes.find((node) => node.depth === 0 && !node.combo);
        if (!rootNode) continue;

        rootItemIdByBuild.set(build.id, rootNode.itemId);

        // Only depth === 1 — a *direct* structural edge to the root, not a deeper/indirect one (see
        // ItemPower.probability's doc for why this was narrowed from "any depth ≥ 1").
        const sources = scalerSourcesByRoot.get(rootNode.itemId) ?? [];
        for (const node of result.nodes) {
            if (node.combo || node.depth !== 1) continue;
            const scalerProbability = shopAppearances?.get(node.itemId)?.perVisitProbability;
            if (!scalerProbability) continue;
            sources.push({ itemId: node.itemId, buildId: build.id, buildName: build.name, probability: scalerProbability });
        }
        scalerSourcesByRoot.set(rootNode.itemId, sources);
    }

    const totalItemCount = items.length;

    const powers = new Map<string, ItemPower>();

    for (const item of items) {
        const moneyValue = moneyValueOf(item);
        const averageValue = averageValueOf(item);
        const scalerSources = scalerSourcesByRoot.get(item.id);
        const probabilityIsAuto = scalerSources !== undefined;
        const probability = probabilityIsAuto
            ? scalerSources.reduce((sum, source) => sum + source.probability, 0)
            : balanceConfig.scaleChelAppearanceProbability;
        const buildPresence = presenceByItem.get(item.id) ?? [];
        const buildCoefficientSum = buildPresence.reduce((sum, entry) => sum + entry.coefficient, 0);
        const buildTerm = averageValue * buildCoefficientSum;

        const directConnectionsCount = directNeighborsByItem.get(item.id)?.size ?? 0;

        const qualifyingBuildEntries = buildPresence
            .filter((entry) => entry.depth <= balanceConfig.qualifyingBuildDepthThreshold)
            .map((entry) => {
                const rootItem = itemsById.get(rootItemIdByBuild.get(entry.buildId) ?? "");
                const q = rootItem ? moneyValueOf(rootItem) + averageValueOf(rootItem) : 0;
                const v = entry.coefficient;
                return { buildId: entry.buildId, buildName: entry.buildName, depth: entry.depth, q, v, product: q * v };
            });
        const qualifyingBuildCount = qualifyingBuildEntries.length;
        const sumQV = qualifyingBuildEntries.reduce((sum, entry) => sum + entry.product, 0);
        const formulaMultiplier =
            totalItemCount > 0 ? (qualifyingBuildCount * (directConnectionsCount + 1)) / totalItemCount : 0;
        const power = moneyValue + averageValue + formulaMultiplier * sumQV;

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
        const mechanicTermsWithProbability = mechanicTermsSum * (1 + probability);
        const mechanicPower = moneyValue + mechanicTermsWithProbability + buildTerm;

        powers.set(item.id, {
            moneyValue,
            averageValue,
            probability,
            probabilityIsAuto,
            probabilitySources: scalerSources ?? [],
            buildPresence,
            buildCoefficientSum,
            buildTerm,
            directConnectionsCount,
            qualifyingBuildEntries,
            qualifyingBuildCount,
            sumQV,
            totalItemCount,
            formulaMultiplier,
            power,
            mechanicTerms,
            mechanicTermsSum,
            mechanicTermsWithProbability,
            mechanicPower,
        });
    }

    return powers;
}
