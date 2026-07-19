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

/**
 * Every item needs *some* mechanic to exist in the game engine at all, so an item with no real designed payoff
 * still gets a placeholder MainValue-earning row just to satisfy that requirement. The item's own imported
 * ValueMin/ValueMax columns (see normalize.ts) are the structural tell: both zero (or blank/unparsed) means no
 * real value range was ever configured for it, so the MainValue row is a placeholder, not a thematic payoff.
 * Real examples: Бездомный/Заключенный (ValueMin=ValueMax=0), Уличный музыкант (both blank).
 * ⚠️ Known accepted gap, explicitly requested by the user in favor of a structural-only rule over a
 * description-text-based one: Producer (`c_chel_money_2_1`) has ValueMin=ValueMax=5 (nonzero) despite its
 * description confirming it's just as flat as the excluded examples ("Дает ${MoneyValue}", no dynamic value
 * mentioned) — it will still incorrectly pass this check and become a root. See relations.test.ts/project memory.
 */
function hasNoRealMainValueRange(item: Item): boolean {
    const min = item.valueMin ?? 0;
    const max = item.valueMax ?? 0;
    return min === 0 && max === 0;
}

/**
 * A PlayerScore-earning MechAddValue row is only root-eligible by default when it modifies MainValue AND the
 * item has a real ValueMin/ValueMax range configured — otherwise it's either a MoneyValue stat (e.g. the
 * starting character's flat starting-money) or a MainValue row on an item with no real value range at all (an
 * engine-required placeholder mechanic, not a thematic payoff). includeMoneyValueRoots opts back into both.
 */
function isEligiblePayoffRow(item: Item, row: MechanicRow, includeMoneyValueRoots: boolean): boolean {
    if (row.table !== "MechAddValue" || !splitList(row.fields.TargetType ?? "").includes(PLAYER_SCORE_TARGET_TYPE)) {
        return false;
    }
    if (includeMoneyValueRoots) return true;
    return row.fields.TargetValueType === MAIN_VALUE_TARGET_VALUE_TYPE && !hasNoRealMainValueRange(item);
}

/**
 * TargetColor/ActivatorColor/BonusTargetColor values that don't name a concrete color at all — they're resolved
 * at runtime relative to whatever's already there ("Same"/"NotSame" as the cell/item they're compared against,
 * "Random" per-spin). A recolorer's own NewColor can be one of these too. Comparing them by exact string equality
 * (e.g. a payoff's BonusTargetColor="Same" against a recolorer's NewColor="Same") only coincidentally matches
 * when both happen to use the same placeholder — it silently excludes recolorers using a *different* placeholder
 * (NewColor="Random"/"NotSame"), even though they're equally unpredictable and equally relevant. When either side
 * is one of these, there's no way to statically know which literal color results, so any recolorer is a candidate
 * lever — same treatment ColorChange-event-based matching already gets (see producedActivatorType).
 */
const RELATIVE_COLOR_VALUES = new Set(["Same", "NotSame", "Random"]);

/** The only real item-category values — TargetType/BonusTargetType is otherwise a board/place dimension (Road,
 *  NotRoad, All, PlayerScore, ...), not an item category, and matching those against item.itemType would either
 *  match nothing (correct, if accidentally) or — worse — be mistaken for a real filter. Only these three describe
 *  an actual item.itemType, per normalize.ts's ITEM_CATEGORY_HINTS — there is structurally no fourth category. */
const ITEM_CATEGORY_TYPE_VALUES = new Set(["Card", "House", "Artefact"]);

interface CascadeIndex {
    /** targetId -> items whose MechAddValue row applies its effect onto it directly (UseTargetIds/TargetItemId) —
     *  i.e. who *boosts* it. Deliberately MechAddValue-only: a mechanic naming this item's id in another table
     *  (MechAddItem "удалить" killing it, MechChangeColor recoloring it, ...) is a real connection but not a
     *  "strengthens it" one, and folding both into one bucket made a kill-by-id read the same as a value boost. */
    targetersOf: Map<string, Set<string>>;

    /** targetId -> items that place/replace it onto the board (MechAddItem "поставить", or the itemIdToReplace
     *  side of a ReplaceItem/ReplaceOnTrigger swap that turns into it). Directional: a replace rule's
     *  replacementItem is not a "spawner of" its itemIdToReplace — it's what that item becomes, not what
     *  produces it (see buildReplaceMates in relatedItems for the symmetric version of this same rule, used
     *  where direction genuinely doesn't matter). */
    spawnersOf: Map<string, Set<string>>;

    /** tag -> items *statically* carrying that tag (item.tags only — not mechanic-derived, see itemIdsByGrantedTag for that). */
    itemIdsByTag: Map<string, Set<string>>;

    /** itemType -> items of that type (Card/House/Artefact only). */
    itemIdsByType: Map<string, Set<string>>;

    /** color -> items whose MechChangeColor row produces that literal color (including the relative placeholders
     *  themselves as keys — resolving those needs allRecolorers instead, see RELATIVE_COLOR_VALUES). */
    itemIdsByProducedColor: Map<string, Set<string>>;

    /** Every item with at least one MechChangeColor row, regardless of which color it produces — the fallback
     *  pool when a payoff's own color filter is a relative placeholder (see RELATIVE_COLOR_VALUES). */
    allRecolorers: Set<string>;

    /** event -> items whose mechanic structurally produces that ActivatorType event with no tag qualifier (see
     *  producedActivatorType) — used when the payoff row has no ActivatorTag to narrow it with. */
    itemIdsByProducedEvent: Map<string, Set<string>>;

    /** "event|tag" -> items whose mechanic structurally produces that event *specifically for something carrying
     *  that tag* — e.g. "ItemPlaced|Crazy" is items that place a Crazy-tagged item (not just items that place
     *  *something*). For MechAddItem "поставить" rows this looks up the placed item's own static tags; for
     *  "удалить" rows the row's own TargetTag field already names the tag of what's removed. Lets a payoff row
     *  combining ActivatorType+ActivatorTag (e.g. Дурка: ItemPlaced+Crazy) match only the placers of that
     *  specific tag instead of every placer of anything (see producedActivatorType's plain event bucket above). */
    itemIdsByProducedTaggedEvent: Map<string, Set<string>>;

    /** tag -> items whose MechAddTag row grants that tag to something else. */
    itemIdsByGrantedTag: Map<string, Set<string>>;

    /**
     * tag -> items whose MechAddValue row's own TargetTag filter (not a specific id) applies its effect to
     * anything with that tag — i.e. actually boosts a Value/MoneyValue/etc property of whatever carries the tag.
     * Deliberately MechAddValue-only (see targetersOf) and deliberately tag-only, not itemType — TargetType is
     * almost always "Card" (the overwhelming majority of items), so matching on it would connect nearly every
     * item to nearly every build.
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
    const allRecolorers = new Set<string>();
    const itemIdsByProducedEvent = new Map<string, Set<string>>();
    const itemIdsByProducedTaggedEvent = new Map<string, Set<string>>();
    const itemIdsByGrantedTag = new Map<string, Set<string>>();
    const itemIdsByTag = new Map<string, Set<string>>();
    const itemIdsByType = new Map<string, Set<string>>();
    const itemIdsByTargetedTag = new Map<string, Set<string>>();

    const addTo = (map: Map<string, Set<string>>, key: string, value: string) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(value);
    };

    const tagsById = new Map<string, string[]>();
    for (const item of items) {
        tagsById.set(item.id, item.tags);
        for (const tag of item.tags) addTo(itemIdsByTag, tag, item.id);
        if (item.itemType) addTo(itemIdsByType, item.itemType, item.id);
    }

    for (const [itemId, rows] of mechanicsByItem) {
        for (const row of rows) {
            if (row.table === "MechAddValue") {
                const targetIds = [
                    ...splitList(row.fields.UseTargetIds ?? ""),
                    ...splitList(row.fields.TargetItemId ?? ""),
                ].filter((token) => knownIds.has(token));
                for (const token of targetIds) addTo(targetersOf, token, itemId);

                // No concrete target id — the row applies its effect via a Tag filter instead (e.g. "any nearby
                // Card with tag=Sport"), which is just as real a "boosts X" connection as a direct id reference.
                if (targetIds.length === 0) {
                    for (const tag of splitList(row.fields.TargetTag ?? "")) addTo(itemIdsByTargetedTag, tag, itemId);
                }
            }

            if (row.table === "MechAddItem" && row.fields.ItemMech === "поставить") {
                const target = row.fields.NewItemId;
                if (target && knownIds.has(target)) {
                    addTo(spawnersOf, target, itemId);
                    for (const tag of tagsById.get(target) ?? []) {
                        addTo(itemIdsByProducedTaggedEvent, `ItemPlaced|${tag}`, itemId);
                    }
                }
            }

            if (row.table === "MechAddItem" && row.fields.ItemMech === "удалить") {
                for (const tag of splitList(row.fields.TargetTag ?? "")) {
                    addTo(itemIdsByProducedTaggedEvent, `ItemRemoved|${tag}`, itemId);
                }
            }

            if (row.table === "MechChangeColor" && row.fields.NewColor) {
                addTo(itemIdsByProducedColor, row.fields.NewColor, itemId);
                allRecolorers.add(itemId);
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
        }
    }

    return {
        targetersOf,
        spawnersOf,
        itemIdsByTag,
        itemIdsByType,
        itemIdsByProducedColor,
        allRecolorers,
        itemIdsByProducedEvent,
        itemIdsByProducedTaggedEvent,
        itemIdsByGrantedTag,
        itemIdsByTargetedTag,
    };
}

function recolorersForColor(index: CascadeIndex, color: string): Iterable<string> {
    return RELATIVE_COLOR_VALUES.has(color) ? index.allRecolorers : index.itemIdsByProducedColor.get(color) ?? [];
}

/** Union-of-matches filter (any populated field is independently sufficient) — used for level 3's Activator
 *  filter, where tag/color describe alternative ways an item could plausibly be "the thing that triggered this". */
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
        for (const id of recolorersForColor(index, color)) into.add(id);
    }
}

/**
 * Intersection-of-matches filter (every populated field must hold at once) — used for level 2's Bonus filter,
 * where tag+type together describe ONE compound condition on the same counted thing (e.g. Бухгалтер: "a Card
 * tagged Rich", not "anything tagged Rich OR any Card at all"). Type is skipped when it's not a real item
 * category (Card/House/Artefact) — a board/place value like "Road" isn't a claim about item.itemType at all, so
 * treating it as one would either match nothing or (worse) get read as "and also must have no itemType".
 */
function collectScalers(index: CascadeIndex, fields: { tag?: string; type?: string }): Set<string> {
    const tagFilters = splitList(fields.tag ?? "");
    const typeFilters = splitList(fields.type ?? "").filter((type) => ITEM_CATEGORY_TYPE_VALUES.has(type));

    let candidates: Set<string> | undefined;
    const intersectWith = (pool: Set<string>) => {
        candidates = candidates ? new Set([...candidates].filter((id) => pool.has(id))) : new Set(pool);
    };

    if (tagFilters.length > 0) {
        const pool = new Set<string>();
        for (const tag of tagFilters) for (const id of index.itemIdsByTag.get(tag) ?? []) pool.add(id);
        intersectWith(pool);
    }
    if (typeFilters.length > 0) {
        const pool = new Set<string>();
        for (const type of typeFilters) for (const id of index.itemIdsByType.get(type) ?? []) pool.add(id);
        intersectWith(pool);
    }

    return candidates ?? new Set();
}

/**
 * Draft one build per item that earns PlayerScore (a MechAddValue row with TargetType=PlayerScore), following a
 * fixed, shallow structure — deliberately NOT a long recursive cascade, per the user's explicit request:
 *   1. Root — the item whose MechAddValue row earns PlayerScore; the build exists because of it.
 *   2. Scalers — items matching that row's Bonus filter, i.e. what's actually being counted to scale the root's
 *      income. Tag and type together are ONE compound condition on the same counted thing (collectScalers) — a
 *      row with both BonusTargetTag=Rich and BonusTargetType=Card means "a Card tagged Rich", not "anything
 *      tagged Rich, or separately, any Card at all" (the latter reads as "nearly every item in the game").
 *   3. Activators of the root — UseActivatorIds if the row names a concrete item; else items matching the
 *      Activator tag/color filter (color treats "Same"/"NotSame"/"Random" as "any recolorer", see
 *      RELATIVE_COLOR_VALUES — these aren't real colors, so exact-string-matching them against a recolorer's own
 *      NewColor only coincidentally works when both happen to use the same placeholder); plus items structurally
 *      producing the row's ActivatorType event — narrowed to producers of that event *for the row's own
 *      ActivatorTag specifically* when one is set (itemIdsByProducedTaggedEvent), not every producer of that
 *      event type regardless of tag (e.g. Дурка wants placers of a Crazy-tagged item, not every "поставить" row
 *      in the game).
 *   4. Spawners of the root — items placing it via MechAddItem, or the itemIdToReplace side of a
 *      ReplaceItem/ReplaceOnTrigger rule that turns into it.
 *   5. Spawners of the level-2 scalers and level-3 activators; recolorers matching the root's Bonus color (same
 *      relative-placeholder handling as level 3); tag-granters producing a tag the root's own filters need; and
 *      anything that *boosts* the root — either directly by id, or via a Tag filter matching one of the root's
 *      own static tags (e.g. an item that adds Value to any nearby Card tagged "Sport" reaches a root that
 *      happens to carry that tag, with no id reference at all) — but only from MechAddValue rows (targetersOf/
 *      itemIdsByTargetedTag), since only those actually raise a Value/MoneyValue/etc property; a mechanic from
 *      any other table that merely *names* the root's id or tag (kills it, recolors it, retags it, ...) is a
 *      different kind of relationship and isn't folded in here as if it were a boost.
 * No further recursion past level 5 — each level is computed straight from the root/level-2/level-3 identities,
 * not from whatever got discovered at levels 4/5 themselves.
 *
 * A PlayerScore payoff row is only root-eligible when it modifies MainValue *and* the item has a real ValueMin/
 * ValueMax range configured (see isEligiblePayoffRow/hasNoRealMainValueRange) — a MoneyValue payoff (e.g. the
 * starting "Силуэт" character's flat starting-money stat) or a MainValue payoff on an item with no configured
 * value range at all (an engine-required placeholder mechanic — every item needs *some* mechanic to exist at
 * all — e.g. Бездомный/Заключенный/Уличный музыкант) are both baseline stats, not thematic payoffs, so both are
 * excluded by default. `includeMoneyValueRoots` opts back into both at once.
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
        (mechanicsByItem.get(item.id) ?? []).some((row) => isEligiblePayoffRow(item, row, includeMoneyValueRoots))
    );

    const existingItemSets = existingBuilds.map((build) => new Set(build.items));
    const drafts: Build[] = [];

    for (const root of roots) {
        const payoffRows = (mechanicsByItem.get(root.id) ?? []).filter((row) =>
            isEligiblePayoffRow(root, row, includeMoneyValueRoots)
        );

        const buildItems = new Set<string>([root.id]);

        // Level 2 — scalers: items matching the payoff's own compound Bonus filter (tag AND type together).
        const scalers = new Set<string>();
        for (const row of payoffRows) {
            for (const id of collectScalers(index, { tag: row.fields.BonusTargetTag, type: row.fields.BonusTargetType })) {
                scalers.add(id);
            }
        }
        scalers.delete(root.id);
        for (const id of scalers) buildItems.add(id);

        // Level 3 — activators of the root.
        const activatorsAll = new Set<string>();
        for (const row of payoffRows) {
            const activatorIds = splitList(row.fields.UseActivatorIds ?? "").filter((id) => knownIds.has(id));
            if (activatorIds.length > 0) {
                for (const id of activatorIds) activatorsAll.add(id);
                continue;
            }
            const activators = new Set<string>();
            collectByFilter(index, { tag: row.fields.ActivatorTag, color: row.fields.ActivatorColor }, activators);
            if (row.fields.ActivatorType) {
                const activatorTags = splitList(row.fields.ActivatorTag ?? "");
                if (activatorTags.length > 0) {
                    for (const tag of activatorTags) {
                        for (const id of index.itemIdsByProducedTaggedEvent.get(`${row.fields.ActivatorType}|${tag}`) ?? []) {
                            activators.add(id);
                        }
                    }
                } else {
                    for (const id of index.itemIdsByProducedEvent.get(row.fields.ActivatorType) ?? []) activators.add(id);
                }
            }
            activators.delete(root.id);
            for (const id of activators) activatorsAll.add(id);
        }
        for (const id of activatorsAll) buildItems.add(id);

        // Level 4 — spawners of the root.
        for (const id of index.spawnersOf.get(root.id) ?? []) buildItems.add(id);

        // Level 5 — spawners of the level-2 scalers and level-3 activators, plus recolorers/tag-granters/boosters.
        for (const scalerId of scalers) {
            for (const id of index.spawnersOf.get(scalerId) ?? []) buildItems.add(id);
        }
        for (const activatorId of activatorsAll) {
            for (const id of index.spawnersOf.get(activatorId) ?? []) buildItems.add(id);
        }
        for (const row of payoffRows) {
            for (const color of splitList(row.fields.BonusTargetColor ?? "")) {
                for (const id of recolorersForColor(index, color)) buildItems.add(id);
            }
            for (const tag of [...splitList(row.fields.BonusTargetTag ?? ""), ...splitList(row.fields.ActivatorTag ?? "")]) {
                for (const id of index.itemIdsByGrantedTag.get(tag) ?? []) buildItems.add(id);
            }
        }
        for (const id of index.targetersOf.get(root.id) ?? []) buildItems.add(id);
        // Same idea as targetersOf, but for effects that boost root via a Tag filter rather than its specific id
        // (e.g. "add Value to any nearby Card with tag=Sport" reaching a Sport-tagged root).
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
