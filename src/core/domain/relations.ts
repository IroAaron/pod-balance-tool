import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { MechanicRow } from "../models/Mechanic";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { ReplaceRule } from "../models/ReplaceRule";

function splitList(value: string): string[] {
    return value
        .split(/[|,;]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function groupByItemId(mechanics: MechanicRow[]): Map<string, MechanicRow[]> {
    const map = new Map<string, MechanicRow[]>();
    for (const mechanic of mechanics) {
        if (!map.has(mechanic.itemId)) map.set(mechanic.itemId, []);
        map.get(mechanic.itemId)!.push(mechanic);
    }
    return map;
}

/** Ids of every upgrade tier past the first — power-scaled clones of the base item. */
export function higherTierIds(upgradeChains: UpgradeChain[]): Set<string> {
    return new Set(upgradeChains.flatMap((chain) => chain.itemIds.slice(1)));
}

/** Maps each item id to the set of other item ids sharing its upgrade chain. */
function buildChainMates(upgradeChains: UpgradeChain[]): Map<string, Set<string>> {
    const mates = new Map<string, Set<string>>();

    for (const chain of upgradeChains) {
        for (const id of chain.itemIds) {
            if (!mates.has(id)) mates.set(id, new Set());
            for (const other of chain.itemIds) {
                if (other !== id) mates.get(id)!.add(other);
            }
        }
    }

    return mates;
}

/** All item-id-shaped tokens a replace rule references (itemIdToReplace, replacementItem, and any id-like value in its extra fields, e.g. ReplaceItem's NeededItem). */
function replaceRuleIdTokens(rule: ReplaceRule): string[] {
    return [rule.itemIdToReplace, rule.replacementItem, ...Object.values(rule.fields).flatMap(splitList)];
}

/** Maps each item id to the set of other item ids it's linked to via a replace rule (either direction). */
function buildReplaceMates(replaceRules: ReplaceRule[], knownIds: Set<string>): Map<string, Set<string>> {
    const mates = new Map<string, Set<string>>();

    for (const rule of replaceRules) {
        const ids = replaceRuleIdTokens(rule).filter((id) => knownIds.has(id));
        for (const id of ids) {
            if (!mates.has(id)) mates.set(id, new Set());
            for (const other of ids) {
                if (other !== id) mates.get(id)!.add(other);
            }
        }
    }

    return mates;
}

class UnionFind {
    private parent = new Map<string, string>();

    find(x: string): string {
        if (!this.parent.has(x)) this.parent.set(x, x);
        const p = this.parent.get(x)!;
        if (p !== x) {
            const root = this.find(p);
            this.parent.set(x, root);
            return root;
        }
        return x;
    }

    union(a: string, b: string): void {
        const rootA = this.find(a);
        const rootB = this.find(b);
        if (rootA !== rootB) this.parent.set(rootA, rootB);
    }
}

/**
 * Draft Build clusters from strong signals only — items whose mechanics reference another item's Id directly
 * (UseTargetIds, MechAddItem's NewItemId, etc. — detected generically by scanning field values against known
 * item Ids), items linked by a ReplaceItem/ReplaceOnTrigger rule, or items that are tiers of the same upgrade
 * chain. Deliberately **not** shared tags — a shared tag is not a causal connection by itself and pulled too
 * many unrelated items into one cluster in practice; every remaining signal here is rooted in an actual
 * mechanic/structural reference between the two specific items.
 *
 * These are a starting point, not a final answer — the user is expected to split/merge/rename drafts on the
 * Builds page rather than accept them as-is.
 */
export function computeSuggestedBuilds(
    items: Item[],
    mechanics: MechanicRow[],
    upgradeChains: UpgradeChain[],
    replaceRules: ReplaceRule[],
    existingBuilds: Build[] = []
): Build[] {
    const knownIds = new Set(items.map((item) => item.id));
    const mechanicsByItem = groupByItemId(mechanics);

    const unionFind = new UnionFind();
    for (const item of items) unionFind.find(item.id);

    for (const item of items) {
        for (const mechanic of mechanicsByItem.get(item.id) ?? []) {
            for (const value of Object.values(mechanic.fields)) {
                for (const token of splitList(value)) {
                    if (knownIds.has(token) && token !== item.id) {
                        unionFind.union(item.id, token);
                    }
                }
            }
        }
    }

    for (const chain of upgradeChains) {
        const tierIds = chain.itemIds.filter((id) => knownIds.has(id));
        for (let i = 1; i < tierIds.length; i++) unionFind.union(tierIds[0], tierIds[i]);
    }

    for (const rule of replaceRules) {
        const ids = replaceRuleIdTokens(rule).filter((id) => knownIds.has(id));
        for (let i = 1; i < ids.length; i++) unionFind.union(ids[0], ids[i]);
    }

    const clusters = new Map<string, string[]>();
    for (const item of items) {
        const root = unionFind.find(item.id);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(item.id);
    }

    const existingItemSets = existingBuilds.map((build) => new Set(build.items));

    const drafts: Build[] = [];
    for (const clusterItems of clusters.values()) {
        if (clusterItems.length < 2) continue;

        const alreadyCovered = existingItemSets.some(
            (existing) =>
                existing.size === clusterItems.length && clusterItems.every((id) => existing.has(id))
        );
        if (alreadyCovered) continue;

        const sortedIds = clusterItems.slice().sort();
        drafts.push({
            id: `draft-${sortedIds.join("-").slice(0, 48)}-${Math.random().toString(36).slice(2, 7)}`,
            name: "",
            items: clusterItems,
            auto: true,
        });
    }

    return drafts;
}

export interface RelatedItem {
    id: string;

    strength: "strong" | "weak";

    score: number;

    reasons: string[];
}

const WEAK_SIGNAL_KEY_PATTERNS = [/type/i, /color/i, /place/i, /sound/i];

function isWeakSignalKey(key: string): boolean {
    return WEAK_SIGNAL_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function fieldFingerprints(mechanics: MechanicRow[]): Set<string> {
    const fingerprints = new Set<string>();
    for (const mechanic of mechanics) {
        for (const [key, value] of Object.entries(mechanic.fields)) {
            if (!isWeakSignalKey(key)) continue;
            fingerprints.add(`${mechanic.table}.${key}=${value}`);
        }
    }
    return fingerprints;
}

/**
 * The ActivatorType event a mechanic row's own effect structurally produces,
 * if any — e.g. a MechChangeColor row always fires a ColorChange event when
 * it triggers, regardless of what its own ActivatorType/filters are. This is
 * what connects a "recolors things" item to an item that listens for
 * ActivatorType=ColorChange, even with no shared tag between them.
 */
function producedActivatorType(mechanic: MechanicRow): string | undefined {
    if (mechanic.table === "MechChangeColor") return "ColorChange";
    if (mechanic.table === "MechAddItem") {
        const itemMech = mechanic.fields.ItemMech;
        if (itemMech === "удалить") return "ItemRemoved";
        if (itemMech === "поставить") return "ItemPlaced";
    }
    return undefined;
}

function computeProducedEvents(mechanicsByItem: Map<string, MechanicRow[]>): Map<string, Set<string>> {
    const produced = new Map<string, Set<string>>();
    for (const [itemId, rows] of mechanicsByItem) {
        const events = new Set<string>();
        for (const row of rows) {
            const event = producedActivatorType(row);
            if (event) events.add(event);
        }
        if (events.size > 0) produced.set(itemId, events);
    }
    return produced;
}

function computeListenedEvents(mechanicsByItem: Map<string, MechanicRow[]>): Map<string, Set<string>> {
    const listened = new Map<string, Set<string>>();
    for (const [itemId, rows] of mechanicsByItem) {
        const events = new Set<string>();
        for (const row of rows) {
            const value = row.fields.ActivatorType;
            if (value) events.add(value);
        }
        if (events.size > 0) listened.set(itemId, events);
    }
    return listened;
}

const PLAYER_SCORE_TARGET_TYPE = "PlayerScore";
const MAIN_VALUE_TARGET_VALUE_TYPE = "MainValue";
const MONEY_VALUE_TARGET_VALUE_TYPE = "MoneyValue";

/** A PlayerScore-earning MechAddValue row is only root-eligible if it modifies MainValue — MoneyValue rows (a rare
 *  "starting money" stat, not a thematic payoff) only count when the user opts in via includeMoneyValueRoots. */
function isEligiblePayoffRow(row: MechanicRow, includeMoneyValueRoots: boolean): boolean {
    if (row.table !== "MechAddValue" || !splitList(row.fields.TargetType ?? "").includes(PLAYER_SCORE_TARGET_TYPE)) {
        return false;
    }
    const valueType = row.fields.TargetValueType ?? "";
    if (valueType === MAIN_VALUE_TARGET_VALUE_TYPE) return true;
    return includeMoneyValueRoots && valueType === MONEY_VALUE_TARGET_VALUE_TYPE;
}

interface CascadeIndex {
    /** targetId -> items whose mechanic applies its effect onto it directly (UseTargetIds/TargetItemId) — i.e. who acts on/modifies it. */
    targetersOf: Map<string, Set<string>>;

    /** targetId -> items that place/replace it onto the board (MechAddItem "поставить", or either side of a ReplaceItem/ReplaceOnTrigger swap). */
    spawnersOf: Map<string, Set<string>>;

    /** tag -> items *statically* carrying that tag (item.tags only — not mechanic-derived, see itemIdsByGrantedTag for that). */
    itemIdsByTag: Map<string, Set<string>>;

    /** itemType -> items of that type. */
    itemIdsByType: Map<string, Set<string>>;

    /** color -> items whose MechChangeColor row produces that color. */
    itemIdsByProducedColor: Map<string, Set<string>>;

    /** event -> items whose mechanic structurally produces that ActivatorType event (see producedActivatorType). */
    itemIdsByProducedEvent: Map<string, Set<string>>;

    /** tag -> items whose MechAddTag row grants that tag to something else. */
    itemIdsByGrantedTag: Map<string, Set<string>>;

    /**
     * tag -> items whose mechanic's own TargetTag filter (not a specific id) applies its effect to anything with
     * that tag. Deliberately tag-only, not itemType — TargetType is almost always "Card" (the overwhelming
     * majority of items), so matching on it would connect nearly every item to nearly every build.
     */
    itemIdsByTargetedTag: Map<string, Set<string>>;
}

function buildCascadeIndex(
    items: Item[],
    mechanicsByItem: Map<string, MechanicRow[]>,
    replaceRules: ReplaceRule[],
    knownIds: Set<string>
): CascadeIndex {
    const targetersOf = new Map<string, Set<string>>();
    const spawnersOf = new Map<string, Set<string>>();
    const itemIdsByProducedColor = new Map<string, Set<string>>();
    const itemIdsByProducedEvent = new Map<string, Set<string>>();
    const itemIdsByGrantedTag = new Map<string, Set<string>>();
    const itemIdsByTag = new Map<string, Set<string>>();
    const itemIdsByType = new Map<string, Set<string>>();
    const itemIdsByTargetedTag = new Map<string, Set<string>>();

    const addTo = (map: Map<string, Set<string>>, key: string, value: string) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(value);
    };

    for (const item of items) {
        for (const tag of item.tags) addTo(itemIdsByTag, tag, item.id);
        if (item.itemType) addTo(itemIdsByType, item.itemType, item.id);
    }

    for (const [itemId, rows] of mechanicsByItem) {
        for (const row of rows) {
            const targetIds = [...splitList(row.fields.UseTargetIds ?? ""), ...splitList(row.fields.TargetItemId ?? "")].filter(
                (token) => knownIds.has(token)
            );
            for (const token of targetIds) addTo(targetersOf, token, itemId);

            // No concrete target id — the row applies its effect via a Tag filter instead (e.g. "any nearby Card
            // with tag=Sport"), which is just as real a "targets X" connection as a direct id reference.
            if (targetIds.length === 0) {
                for (const tag of splitList(row.fields.TargetTag ?? "")) addTo(itemIdsByTargetedTag, tag, itemId);
            }

            if (row.table === "MechAddItem" && row.fields.ItemMech === "поставить") {
                const target = row.fields.NewItemId;
                if (target && knownIds.has(target)) addTo(spawnersOf, target, itemId);
            }

            if (row.table === "MechChangeColor" && row.fields.NewColor) {
                addTo(itemIdsByProducedColor, row.fields.NewColor, itemId);
            }

            if (row.table === "MechAddTag") {
                for (const tag of splitList(row.fields.NewTags ?? "")) addTo(itemIdsByGrantedTag, tag, itemId);
            }

            const event = producedActivatorType(row);
            if (event) addTo(itemIdsByProducedEvent, event, itemId);
        }
    }

    for (const rule of replaceRules) {
        if (knownIds.has(rule.itemIdToReplace) && knownIds.has(rule.replacementItem)) {
            addTo(spawnersOf, rule.replacementItem, rule.itemIdToReplace);
            addTo(spawnersOf, rule.itemIdToReplace, rule.replacementItem);
        }
    }

    return {
        targetersOf,
        spawnersOf,
        itemIdsByTag,
        itemIdsByType,
        itemIdsByProducedColor,
        itemIdsByProducedEvent,
        itemIdsByGrantedTag,
        itemIdsByTargetedTag,
    };
}

function collectByFilter(
    index: CascadeIndex,
    fields: { tag?: string; type?: string; color?: string },
    into: Set<string>
): void {
    for (const tag of splitList(fields.tag ?? "")) {
        for (const id of index.itemIdsByTag.get(tag) ?? []) into.add(id);
    }
    for (const type of splitList(fields.type ?? "")) {
        for (const id of index.itemIdsByType.get(type) ?? []) into.add(id);
    }
    for (const color of splitList(fields.color ?? "")) {
        for (const id of index.itemIdsByProducedColor.get(color) ?? []) into.add(id);
    }
}

/**
 * Draft one build per item that earns PlayerScore (a MechAddValue row with TargetType=PlayerScore), following a
 * fixed, shallow structure — deliberately NOT a long recursive cascade, per the user's explicit request:
 *   1. Root — the item whose MechAddValue row earns PlayerScore; the build exists because of it.
 *   2. Scalers — items matching that row's Bonus filter (BonusTargetTag/BonusTargetType), i.e. what's actually
 *      being counted to scale the root's income.
 *   3. Activators of the root — UseActivatorIds if the row names a concrete item, else items matching the
 *      Activator filter (tag/type membership, produced color, or structurally-produced ActivatorType event).
 *   4. Spawners of the root — items placing it via MechAddItem, or either side of a ReplaceItem/ReplaceOnTrigger
 *      swap involving it.
 *   5. Spawners of the level-2 scalers, plus anything that influences the root/scalers' relevant properties:
 *      recolorers matching the root's Bonus color, tag-granters producing a tag the root's own filters need, and
 *      anything that targets the root — either directly by id (UseTargetIds/TargetItemId), or by a Tag filter
 *      matching one of the root's own static tags (e.g. an item that boosts the Value of any nearby Card tagged
 *      "Sport" reaches a root that happens to carry that tag, with no id reference at all — deliberately tag-only,
 *      not itemType, since TargetType is almost always "Card" and would connect nearly everything) —
 *      "meняет Value первого".
 * No further recursion past level 5 — each level is computed straight from the root/level-2 identities, not from
 * whatever got discovered at levels 3/4/5 themselves.
 *
 * A PlayerScore payoff row is only root-eligible when it modifies MainValue — a MoneyValue payoff (e.g. the
 * starting "Силуэт" character's flat starting-money stat) is a baseline stat, not a thematic payoff, so it's
 * excluded by default. `includeMoneyValueRoots` opts back in.
 */
export function computeCascadeBuilds(
    items: Item[],
    mechanics: MechanicRow[],
    replaceRules: ReplaceRule[],
    existingBuilds: Build[],
    itemName: (item: Item) => string,
    itemIcon: (item: Item) => string | undefined,
    includeMoneyValueRoots = false
): Build[] {
    const knownIds = new Set(items.map((item) => item.id));
    const mechanicsByItem = groupByItemId(mechanics);
    const index = buildCascadeIndex(items, mechanicsByItem, replaceRules, knownIds);

    const roots = items.filter((item) =>
        (mechanicsByItem.get(item.id) ?? []).some((row) => isEligiblePayoffRow(row, includeMoneyValueRoots))
    );

    const existingItemSets = existingBuilds.map((build) => new Set(build.items));
    const drafts: Build[] = [];

    for (const root of roots) {
        const payoffRows = (mechanicsByItem.get(root.id) ?? []).filter((row) =>
            isEligiblePayoffRow(row, includeMoneyValueRoots)
        );

        const buildItems = new Set<string>([root.id]);

        // Level 2 — scalers: items matching the payoff's own Bonus filter.
        const scalers = new Set<string>();
        for (const row of payoffRows) {
            collectByFilter(index, { tag: row.fields.BonusTargetTag, type: row.fields.BonusTargetType }, scalers);
        }
        scalers.delete(root.id);
        for (const id of scalers) buildItems.add(id);

        // Level 3 — activators of the root.
        for (const row of payoffRows) {
            const activatorIds = splitList(row.fields.UseActivatorIds ?? "").filter((id) => knownIds.has(id));
            if (activatorIds.length > 0) {
                for (const id of activatorIds) buildItems.add(id);
                continue;
            }
            const activators = new Set<string>();
            collectByFilter(index, { tag: row.fields.ActivatorTag, color: row.fields.ActivatorColor }, activators);
            if (row.fields.ActivatorType) {
                for (const id of index.itemIdsByProducedEvent.get(row.fields.ActivatorType) ?? []) activators.add(id);
            }
            activators.delete(root.id);
            for (const id of activators) buildItems.add(id);
        }

        // Level 4 — spawners of the root.
        for (const id of index.spawnersOf.get(root.id) ?? []) buildItems.add(id);

        // Level 5 — spawners of the level-2 scalers, plus recolorers/tag-granters/targeters feeding the root/scalers.
        for (const scalerId of scalers) {
            for (const id of index.spawnersOf.get(scalerId) ?? []) buildItems.add(id);
        }
        for (const row of payoffRows) {
            for (const color of splitList(row.fields.BonusTargetColor ?? "")) {
                for (const id of index.itemIdsByProducedColor.get(color) ?? []) buildItems.add(id);
            }
            for (const tag of [...splitList(row.fields.BonusTargetTag ?? ""), ...splitList(row.fields.ActivatorTag ?? "")]) {
                for (const id of index.itemIdsByGrantedTag.get(tag) ?? []) buildItems.add(id);
            }
        }
        for (const id of index.targetersOf.get(root.id) ?? []) buildItems.add(id);
        // Same idea as targetersOf, but for effects that target root via a Tag filter rather than its specific id
        // (e.g. "modify Value of any nearby Card with tag=Sport" reaching a Sport-tagged root).
        for (const tag of root.tags) {
            for (const id of index.itemIdsByTargetedTag.get(tag) ?? []) buildItems.add(id);
        }

        if (buildItems.size < 2) continue;

        const clusterItems = [...buildItems];
        const alreadyCovered = existingItemSets.some(
            (existing) => existing.size === clusterItems.length && clusterItems.every((id) => existing.has(id))
        );
        if (alreadyCovered) continue;

        drafts.push({
            id: `cascade-${root.id}-${Math.random().toString(36).slice(2, 7)}`,
            name: `Билд от ${itemName(root)}`,
            icon: itemIcon(root),
            items: clusterItems,
            auto: true,
        });
    }

    return drafts;
}

/** Ranked "possibly related" items for an item's detail page — informational only, never auto-clusters. */
export function relatedItems(
    itemId: string,
    items: Item[],
    mechanics: MechanicRow[],
    upgradeChains: UpgradeChain[],
    replaceRules: ReplaceRule[]
): RelatedItem[] {
    const knownIds = new Set(items.map((item) => item.id));
    const mechanicsByItem = groupByItemId(mechanics);
    const chainMates = buildChainMates(upgradeChains);
    const targetChainMates = chainMates.get(itemId) ?? new Set<string>();
    const replaceMates = buildReplaceMates(replaceRules, knownIds);
    const targetReplaceMates = replaceMates.get(itemId) ?? new Set<string>();
    const producedEvents = computeProducedEvents(mechanicsByItem);
    const listenedEvents = computeListenedEvents(mechanicsByItem);
    const targetProduces = producedEvents.get(itemId) ?? new Set<string>();
    const targetListens = listenedEvents.get(itemId) ?? new Set<string>();

    const targetMechanics = mechanicsByItem.get(itemId) ?? [];
    const targetIdRefs = new Set(
        targetMechanics.flatMap((mechanic) =>
            Object.values(mechanic.fields)
                .flatMap(splitList)
                .filter((token) => knownIds.has(token) && token !== itemId)
        )
    );
    const targetFingerprints = fieldFingerprints(targetMechanics);
    const excludedTiers = higherTierIds(upgradeChains);

    const results: RelatedItem[] = [];

    for (const other of items) {
        // Upgrade tiers (+/++) are power-scaled clones of the base item — noise here, not a distinct suggestion.
        if (other.id === itemId || excludedTiers.has(other.id)) continue;

        const reasons: string[] = [];
        let strength: "strong" | "weak" = "weak";
        let score = 0;

        const otherMechanics = mechanicsByItem.get(other.id) ?? [];
        const otherIdRefs = new Set(
            otherMechanics.flatMap((mechanic) => Object.values(mechanic.fields).flatMap(splitList))
        );

        if (targetIdRefs.has(other.id) || otherIdRefs.has(itemId)) {
            strength = "strong";
            score += 10;
            reasons.push("прямая ссылка по Id");
        }

        if (targetChainMates.has(other.id)) {
            strength = "strong";
            score += 15;
            reasons.push("та же цепочка прокачки");
        }

        if (targetReplaceMates.has(other.id)) {
            strength = "strong";
            score += 15;
            reasons.push("связаны правилом замены");
        }

        const otherProduces = producedEvents.get(other.id) ?? new Set<string>();
        const otherListens = listenedEvents.get(other.id) ?? new Set<string>();
        const targetFeedsOther = [...targetProduces].filter((event) => otherListens.has(event));
        const otherFeedsTarget = [...otherProduces].filter((event) => targetListens.has(event));
        if (targetFeedsOther.length > 0 || otherFeedsTarget.length > 0) {
            strength = "strong";
            score += 12;
            if (targetFeedsOther.length > 0) {
                reasons.push(`производит ${targetFeedsOther.join(", ")}, на что реагирует другой`);
            }
            if (otherFeedsTarget.length > 0) {
                reasons.push(`реагирует на ${otherFeedsTarget.join(", ")}, которое производит другой`);
            }
        }

        const otherFingerprints = fieldFingerprints(otherMechanics);
        const sharedFingerprints = [...targetFingerprints].filter((fp) => otherFingerprints.has(fp));
        if (sharedFingerprints.length > 0) {
            score += sharedFingerprints.length;
            reasons.push(`похожие параметры механик (${sharedFingerprints.length})`);
        }

        if (reasons.length > 0) {
            results.push({ id: other.id, strength, score, reasons });
        }
    }

    return results.sort((a, b) => b.score - a.score);
}

export interface RelatedBuild {
    id: string;

    score: number;

    reasons: string[];
}

/**
 * Ranked "possibly related" builds for a build's detail page — informational
 * only, derived from item overlap plus the same strong item-level signals
 * used by relatedItems (ids/chains/replace-rules/produced-events), rolled up
 * to build level. Does not attempt the deeper "this build's payoff is fed by
 * that other build" composition — that needs a human to notice.
 */
export function relatedBuilds(
    buildId: string,
    builds: Build[],
    items: Item[],
    mechanics: MechanicRow[],
    upgradeChains: UpgradeChain[],
    replaceRules: ReplaceRule[]
): RelatedBuild[] {
    const target = builds.find((build) => build.id === buildId);
    if (!target) return [];

    const targetItemSet = new Set(target.items);

    const stronglyRelatedToTarget = new Set<string>();
    for (const itemId of target.items) {
        for (const rel of relatedItems(itemId, items, mechanics, upgradeChains, replaceRules)) {
            if (rel.strength === "strong") stronglyRelatedToTarget.add(rel.id);
        }
    }

    const results: RelatedBuild[] = [];

    for (const other of builds) {
        if (other.id === buildId) continue;

        const sharedItems = other.items.filter((id) => targetItemSet.has(id));
        const bridgingItems = other.items.filter(
            (id) => !targetItemSet.has(id) && stronglyRelatedToTarget.has(id)
        );

        if (sharedItems.length === 0 && bridgingItems.length === 0) continue;

        const reasons: string[] = [];
        if (sharedItems.length > 0) reasons.push(`общие предметы (${sharedItems.length})`);
        if (bridgingItems.length > 0) reasons.push(`связанные предметы (${bridgingItems.length})`);

        results.push({
            id: other.id,
            score: sharedItems.length * 10 + bridgingItems.length * 3,
            reasons,
        });
    }

    return results.sort((a, b) => b.score - a.score);
}

export interface BuildConnection {
    source: string;

    target: string;

    /** 0..1 — sharedItemCount / min(itemsA, itemsB), so a big build sharing one item with a small one reads as weak. */
    strength: number;

    sharedItemCount: number;

    /** True if the user explicitly linked these builds (via GameStore.linkBuilds), regardless of item overlap. */
    manual: boolean;
}

/**
 * Build <-> Build edges for the graph: builds are connected if they share at
 * least one item, or if the user manually linked them. Strength is
 * normalized against the *smaller* of the two builds' item counts, so a
 * 10-item build sharing just 1 item with another build reads as a weak
 * connection rather than as strong as two 2-item builds sharing 1.
 */
export function computeBuildConnections(builds: Build[], upgradeChains: UpgradeChain[]): BuildConnection[] {
    const excludedTiers = higherTierIds(upgradeChains);
    const itemSets = new Map(
        builds.map((build) => [build.id, new Set(build.items.filter((id) => !excludedTiers.has(id)))])
    );

    const connections: BuildConnection[] = [];

    for (let i = 0; i < builds.length; i++) {
        for (let j = i + 1; j < builds.length; j++) {
            const buildA = builds[i];
            const buildB = builds[j];
            const itemsA = itemSets.get(buildA.id)!;
            const itemsB = itemSets.get(buildB.id)!;

            const sharedItemCount = [...itemsA].filter((id) => itemsB.has(id)).length;
            const manual =
                (buildA.manualLinks ?? []).includes(buildB.id) || (buildB.manualLinks ?? []).includes(buildA.id);

            if (sharedItemCount === 0 && !manual) continue;

            const minSize = Math.min(itemsA.size, itemsB.size) || 1;
            const strength = sharedItemCount > 0 ? Math.min(sharedItemCount / minSize, 1) : 1;

            connections.push({ source: buildA.id, target: buildB.id, strength, sharedItemCount, manual });
        }
    }

    return connections;
}
