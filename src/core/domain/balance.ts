import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { MechanicRow } from "../models/Mechanic";
import type { ReplaceRule } from "../models/ReplaceRule";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { BalanceConfig } from "../models/BalanceConfig";
import { computeCascadeLevels } from "./relations";

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

    /** Every build this item was classified into (with a real depth — see BuildPresenceEntry). An item that's a
     *  member of a build but wasn't reachable in that build's own scaling graph (computeCascadeLevels'
     *  `unclassified`) contributes nothing — there's no "ступень" for it to look up a coefficient for. Filtered
     *  down to `qualifyingBuildEntries`/S for the actual formula. */
    buildPresence: BuildPresenceEntry[];

    /** M — count of unique items this item has a *direct* structural connection with (both directions: things
     *  it directly feeds, and things that directly feed it), found only by looking inside the builds in
     *  `qualifyingBuildEntries`/S (not every build the item happens to be a member of). See computeItemPowers'
     *  doc for the full `power` formula. Same set as `directConnectionItemIds`, just the count. */
    directConnectionsCount: number;

    /** The actual deduplicated item ids behind `directConnectionsCount` — every item found as a direct neighbor
     *  (either direction) in at least one build from `qualifyingBuildEntries`/S. Exposed (not just the count) for
     *  the "Баланс → Проверка формулы" tab, which lets the user manually audit exactly what feeds M for a chosen
     *  item. */
    directConnectionItemIds: string[];

    /** S — the subset of `buildPresence` where this item's own depth is ≤
     *  balanceConfig.qualifyingBuildDepthThreshold (N), each paired with that build's own Q (root's MoneyValue +
     *  MainValue), V (this item's depth coefficient in that build — same value as the matching
     *  buildPresence[].coefficient), and the specific item ids found as this item's direct neighbors *within that
     *  one build* (a subset of directConnectionItemIds — see its doc). */
    qualifyingBuildEntries: {
        buildId: string;
        buildName: string;
        depth: number;
        q: number;
        v: number;
        product: number;
        scalerItemIds: string[];
    }[];

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
 *     directly feeds, and things that directly feed X) — found only inside the builds in S itself, not every
 *     build X happens to be a member of. Computed from computeCascadeLevels' `node.parents` (an edge child→parent
 *     in the BFS sense is a direct connection either way you look at it) per qualifying build, then unioned.
 *   - Q_b, for a qualifying build b, is that build's own root item's MoneyValue + MainValue (not X's — the
 *     build's head item, which is X itself only when X happens to be that build's root).
 *   - V_b is X's own depthCoefficients[depth] in build b — literally the same value as
 *     buildPresence.find(e => e.buildId === b).coefficient.
 *   - A is the total number of items `power` was computed over (the full `items` array).
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
    includeMoneyValueRoots = false
): Map<string, ItemPower> {
    const knownIds = new Set(items.map((item) => item.id));
    const itemsById = new Map(items.map((item) => [item.id, item]));

    const presenceByItem = new Map<string, BuildPresenceEntry[]>();

    // buildId -> that build's own root item id — for `power`'s Q_b (the build's root's MoneyValue + MainValue).
    const rootItemIdByBuild = new Map<string, string>();

    // itemId -> buildId -> Set of unique items with a direct structural edge to it *within that build*, either
    // direction — for `power`'s M, which only counts neighbors found inside the builds that end up in S (not
    // every build the item happens to be a member of), so this stays scoped per build rather than one global
    // undirected graph.
    const directNeighborsByItemAndBuild = new Map<string, Map<string, Set<string>>>();
    function addDirectNeighbor(itemId: string, buildId: string, neighborId: string): void {
        if (itemId === neighborId) return;
        const byBuild = directNeighborsByItemAndBuild.get(itemId) ?? new Map<string, Set<string>>();
        const set = byBuild.get(buildId) ?? new Set<string>();
        set.add(neighborId);
        byBuild.set(buildId, set);
        directNeighborsByItemAndBuild.set(itemId, byBuild);
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

            // Every parent edge is a direct connection within THIS build, counted both ways (see
            // directNeighborsByItemAndBuild's doc) — parents pointing at a combo node or an id outside `items`
            // are simply not real items, skipped.
            for (const parent of node.parents) {
                if (!knownIds.has(parent.itemId)) continue;
                addDirectNeighbor(node.itemId, build.id, parent.itemId);
                addDirectNeighbor(parent.itemId, build.id, node.itemId);
            }
        }

        const rootNode = result.nodes.find((node) => node.depth === 0 && !node.combo);
        if (rootNode) rootItemIdByBuild.set(build.id, rootNode.itemId);
    }

    const totalItemCount = items.length;

    const powers = new Map<string, ItemPower>();

    for (const item of items) {
        const moneyValue = moneyValueOf(item);
        const averageValue = averageValueOf(item);
        const buildPresence = presenceByItem.get(item.id) ?? [];

        const neighborsByBuild = directNeighborsByItemAndBuild.get(item.id);

        const qualifyingBuildEntries = buildPresence
            .filter((entry) => entry.depth <= balanceConfig.qualifyingBuildDepthThreshold)
            .map((entry) => {
                const rootItem = itemsById.get(rootItemIdByBuild.get(entry.buildId) ?? "");
                const q = rootItem ? moneyValueOf(rootItem) + averageValueOf(rootItem) : 0;
                const v = entry.coefficient;
                const scalerItemIds = [...(neighborsByBuild?.get(entry.buildId) ?? [])];
                return {
                    buildId: entry.buildId,
                    buildName: entry.buildName,
                    depth: entry.depth,
                    q,
                    v,
                    product: q * v,
                    scalerItemIds,
                };
            });
        const qualifyingBuildCount = qualifyingBuildEntries.length;
        const sumQV = qualifyingBuildEntries.reduce((sum, entry) => sum + entry.product, 0);

        // M — direct neighbors found only inside the qualifying (S) builds, unioned across them.
        const directConnectionsSet = new Set<string>();
        for (const entry of qualifyingBuildEntries) {
            for (const neighborId of entry.scalerItemIds) directConnectionsSet.add(neighborId);
        }
        const directConnectionItemIds = [...directConnectionsSet];
        const directConnectionsCount = directConnectionItemIds.length;
        const formulaMultiplier =
            totalItemCount > 0 ? ((directConnectionsCount + 1)) / totalItemCount : 0;
        const power = moneyValue + averageValue + formulaMultiplier * sumQV;

        powers.set(item.id, {
            moneyValue,
            averageValue,
            buildPresence,
            directConnectionsCount,
            directConnectionItemIds,
            qualifyingBuildEntries,
            qualifyingBuildCount,
            sumQV,
            totalItemCount,
            formulaMultiplier,
            power,
        });
    }

    return powers;
}
