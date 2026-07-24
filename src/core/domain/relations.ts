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

/**
 * Ids of every upgrade tier, by either signal: registered CardUpgrades chain membership (higherTierIds), or a
 * translated display name ending in "+"/"++" — some tiers (e.g. Cheerleader+/Fan+) were never registered in
 * CardUpgrades at all and are only distinguishable by name. Shared by GameStore's build-generation exclusion and
 * the Items page's "Отображать прокачку?" filter, so both use the same definition of "is a tier".
 */
export function computeUpgradeTierIds(
    items: Item[],
    upgradeChains: UpgradeChain[],
    resolveName: (item: Item) => string
): Set<string> {
    const tierIds = higherTierIds(upgradeChains);
    for (const item of items) {
        if (/\+{1,2}$/.test(resolveName(item).trim())) tierIds.add(item.id);
    }
    return tierIds;
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
 *
 * Same idea for a MechAddValue row that raises TargetType=LoopComplitedCounter — real example: Гонщик
 * (`c_chel_plus_loop_1`) increments that counter on every BallPass, and completing it is exactly what the engine
 * fires ActivatorType=LoopCompleted for (what Стадион/Дальнобойщик payoff rows listen for). Without this, nothing
 * ever showed up as a "producer" of LoopCompleted, so cascade-build generation couldn't pull Гонщик into a
 * LoopCompleted-payoff build, and a lone LoopCompleted root with no other structural connection (Дальнобойщик)
 * never reached the 2-item minimum to become a build at all.
 */
function producedActivatorType(mechanic: MechanicRow): string | undefined {
    if (mechanic.table === "MechChangeColor") return "ColorChange";
    if (mechanic.table === "MechAddItem") {
        const itemMech = mechanic.fields.ItemMech;
        if (itemMech === "удалить") return "ItemRemoved";
        if (itemMech === "поставить") return "ItemPlaced";
    }
    if (mechanic.table === "MechAddValue" && mechanic.fields.TargetType === "LoopComplitedCounter") {
        return "LoopCompleted";
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
     *  "удалить"/MechChangeColor rows the row's own TargetTag field already names the tag of what's affected.
     *  Lets a payoff row combining ActivatorType+ActivatorTag (e.g. Дурка: ItemPlaced+Crazy) match only the
     *  producers of that specific tag — see indiscriminateProducersOfEvent for the complementary "no tag named
     *  at all, can't be ruled out" pool used alongside this one. */
    itemIdsByProducedTaggedEvent: Map<string, Set<string>>;

    /**
     * event -> items whose mechanic structurally produces that event with **no tag narrowing at all** (e.g.
     * Маньяк/Killer kill nearby cards with no TargetTag filter — could hit anything). Real example: Чёрный рынок
     * listens for ItemRemoved+Bum; Маньяк/Killer don't name a tag, so they can't be *proven* to miss Bum either —
     * per the user's explicit rule, "no tag" is a candidate, not an exclusion (only a producer that names a
     * *different, concrete* tag is excluded — that producer simply never appears under this event's key here,
     * it lands under itemIdsByProducedTaggedEvent's "event|thatOtherTag" key instead). Board Place (Near/
     * SameSide/OppositeCard/MyPosition/...) is never used to exclude either, for the same reason — see the
     * module-level note by RELATIVE_COLOR_VALUES: any item can be placed on any of the 4 sides, so a
     * self-relative Place filter on the produced side can always be reconciled with the root's own Place filter
     * by choosing where to put things; it's never a proof of incompatibility.
     */
    indiscriminateProducersOfEvent: Map<string, Set<string>>;

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

    /** targetId -> items whose MechActivate row fires an extra activation of it directly (UseTargetIds) — the
     *  "activates" counterpart to targetersOf's "boosts". Kept as a separate map rather than folded into
     *  targetersOf: an extra activation and a value boost are different effects on the target, even though both
     *  read as "this item helps that one". */
    activatorsOf: Map<string, Set<string>>;

    /**
     * tag -> items whose MechActivate row's own TargetTag filter (not a specific id) fires an extra activation of
     * anything with that tag. The "activates" counterpart to itemIdsByTargetedTag. Real example: Тренер
     * (`c_chel_activate_sport_same_color_for_ball_pass_1`, TargetTag=Sport, no UseTargetIds) activates any
     * Sport-tagged card when the ball passes it — this is what lets level 4 find him as a second-order lever for
     * Гонщик (tagged Sport), who has no PlayerScore payoff of his own and only enters a build as a level-3
     * event producer (see producedActivatorType's LoopComplitedCounter case).
     */
    itemIdsByActivatedTag: Map<string, Set<string>>;
}

/**
 * ⚠️ Deliberately NOT an index here: a "boosts/activates any nearby Card/House/Artefact of type X, no tag, no id"
 * signal was tried (2026-07-23) and reverted the same day — real example: Эстакада (any nearby House) and Робот
 * (any nearby House) both connected to "Билд от Черного рынка" this way, alongside Мошенник and Меценат, neither
 * of which has anything to do with Чёрный рынок thematically. The type-only match has no concrete tag or id to
 * anchor it to a *specific* item — it's true of the entire category, not evidence of a real connection to any one
 * root. (Мошенник's appearance was compounded by a genuine bug — his row's `TargetPlace=MyPosition` means he only
 * ever affects himself, and the old code didn't check Place before indexing him as a generic booster at all — but
 * even after fixing that, Меценат's case is not a bug, just this signal being too weak by design.) See
 * computeScalingGraph's doc for the replacement model: only Id/tag/event/replace-rule signals count as real edges.
 */

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
    const indiscriminateProducersOfEvent = new Map<string, Set<string>>();
    const itemIdsByGrantedTag = new Map<string, Set<string>>();
    const itemIdsByTag = new Map<string, Set<string>>();
    const itemIdsByType = new Map<string, Set<string>>();
    const itemIdsByTargetedTag = new Map<string, Set<string>>();
    const activatorsOf = new Map<string, Set<string>>();
    const itemIdsByActivatedTag = new Map<string, Set<string>>();

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

                if (targetIds.length === 0) {
                    // No concrete target id — the row applies its effect via a Tag filter instead (e.g. "any
                    // nearby Card with tag=Sport"), which is just as real a "boosts X" connection as a direct id.
                    // No tag either means the row's effect is too generic to anchor to any specific item — see the
                    // module note above CascadeIndex for why that's deliberately not indexed as a connection at all.
                    for (const tag of splitList(row.fields.TargetTag ?? "")) addTo(itemIdsByTargetedTag, tag, itemId);
                }
            }

            if (row.table === "MechActivate") {
                const targetIds = splitList(row.fields.UseTargetIds ?? "").filter((token) => knownIds.has(token));
                for (const token of targetIds) addTo(activatorsOf, token, itemId);

                if (targetIds.length === 0) {
                    // Same "no id ref needed" case as itemIdsByTargetedTag above, for the "activates" relationship.
                    for (const tag of splitList(row.fields.TargetTag ?? "")) addTo(itemIdsByActivatedTag, tag, itemId);
                }
            }

            if (row.table === "MechAddItem" && row.fields.ItemMech === "поставить") {
                const target = row.fields.NewItemId;
                const placedTags = target && knownIds.has(target) ? tagsById.get(target) ?? [] : undefined;
                if (target && knownIds.has(target)) addTo(spawnersOf, target, itemId);
                if (placedTags && placedTags.length > 0) {
                    for (const tag of placedTags) addTo(itemIdsByProducedTaggedEvent, `ItemPlaced|${tag}`, itemId);
                } else {
                    // Places nothing we can resolve tags for (unknown id), or places something with no tags at
                    // all — can't rule out that it's ever a match, so it's a candidate, not excluded.
                    addTo(indiscriminateProducersOfEvent, "ItemPlaced", itemId);
                }
            }

            if (row.table === "MechAddItem" && row.fields.ItemMech === "удалить") {
                const removedTags = splitList(row.fields.TargetTag ?? "");
                if (removedTags.length > 0) {
                    for (const tag of removedTags) addTo(itemIdsByProducedTaggedEvent, `ItemRemoved|${tag}`, itemId);
                } else {
                    // Kills indiscriminately (no TargetTag) — e.g. Маньяк/Киллер. Could hit anything, so it's a
                    // candidate for any tag-qualified ItemRemoved listener, not excluded.
                    addTo(indiscriminateProducersOfEvent, "ItemRemoved", itemId);
                }
            }

            if (row.table === "MechChangeColor" && row.fields.NewColor) {
                addTo(itemIdsByProducedColor, row.fields.NewColor, itemId);
                allRecolorers.add(itemId);

                const recoloredTags = splitList(row.fields.TargetTag ?? "");
                if (recoloredTags.length > 0) {
                    for (const tag of recoloredTags) addTo(itemIdsByProducedTaggedEvent, `ColorChange|${tag}`, itemId);
                } else {
                    addTo(indiscriminateProducersOfEvent, "ColorChange", itemId);
                }
            }

            if (row.table === "MechAddTag") {
                for (const tag of splitList(row.fields.NewTags ?? "")) addTo(itemIdsByGrantedTag, tag, itemId);
            }

            const event = producedActivatorType(row);
            if (event) {
                addTo(itemIdsByProducedEvent, event, itemId);
                // ItemPlaced/ItemRemoved/ColorChange already got their own tagged-vs-indiscriminate treatment
                // above (they have a real TargetTag concept); anything else producedActivatorType might ever
                // return (e.g. LoopCompleted) has no tag concept at all, so it's always indiscriminate.
                if (event !== "ItemPlaced" && event !== "ItemRemoved" && event !== "ColorChange") {
                    addTo(indiscriminateProducersOfEvent, event, itemId);
                }
            }
        }
    }

    for (const rule of replaceRules) {
        if (!knownIds.has(rule.replacementItem)) continue;

        if (knownIds.has(rule.itemIdToReplace)) {
            addTo(spawnersOf, rule.replacementItem, rule.itemIdToReplace);
        }

        // ReplaceItem rules need a NeededItem present nearby too, not just itemIdToReplace on its own — e.g.
        // Бомж only becomes Рок музыкант next to Музыкальный магазин (NeededItem); Бомж by himself never causes
        // the upgrade, so he isn't the whole story as a "spawner". Both ingredients are real prerequisites.
        // ReplaceOnTrigger rules have no NeededItem column, so this is a no-op there (fields.NeededItem is
        // undefined).
        const neededItem = rule.fields.NeededItem;
        if (neededItem && knownIds.has(neededItem)) {
            addTo(spawnersOf, rule.replacementItem, neededItem);
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
        indiscriminateProducersOfEvent,
        itemIdsByGrantedTag,
        itemIdsByTargetedTag,
        activatorsOf,
        itemIdsByActivatedTag,
    };
}

function recolorersForColor(index: CascadeIndex, color: string): Iterable<string> {
    return RELATIVE_COLOR_VALUES.has(color) ? index.allRecolorers : index.itemIdsByProducedColor.get(color) ?? [];
}

/** True if this item has at least one MechChangeColor row whose own TargetPlace targets something other than
 *  itself (anything but the literal "MyPosition" — Near/SameSide/All/Opposite/...), i.e. it genuinely repaints
 *  someone *else*, not only itself. Needed to tell apart, e.g., Сумасшедший (recolors only himself, TargetPlace=
 *  MyPosition on every row) from Сумасшедший+ (also has a Near row) when a payoff's filter combines a tag with a
 *  color: a self-only recolorer that doesn't itself carry the required tag can never produce a matching target
 *  (see recolorerMatchesTagFilter, the actual caller of this). */
function recolorsSomethingElse(itemId: string, mechanicsByItem: Map<string, MechanicRow[]>): boolean {
    return (mechanicsByItem.get(itemId) ?? []).some(
        (row) => row.table === "MechChangeColor" && row.fields.TargetPlace !== "MyPosition"
    );
}

/**
 * Whether a recolorer candidate is a genuine lever for a payoff row whose Target filter combines a *tag* with a
 * color (e.g. Тренер: TargetTag=Sport + TargetColor=Same — "a same-color Sport card"). Real example that
 * motivated this: Сумасшедший only ever repaints himself and isn't Sport-tagged, so repainting himself can never
 * produce a same-color Sport card — he's not a lever for Тренер at all, even though he's a recolorer and even
 * though "Same" can't rule out any literal color. A recolorer counts as relevant only if it can plausibly produce
 * a card carrying the required tag: either it repaints something *other than itself* (could land on any nearby
 * Sport card, self or not unknown), or it repaints only itself but is *already* tagged with what's required
 * (repainting itself is what makes it a matching target). No required tag at all (empty `requiredTags`) means
 * there's nothing to check here — every recolorer for the color stays relevant, same as before this fix.
 */
function recolorerMatchesTagFilter(
    recolorerId: string,
    requiredTags: string[],
    itemsById: Map<string, Item>,
    mechanicsByItem: Map<string, MechanicRow[]>
): boolean {
    if (requiredTags.length === 0) return true;
    if (recolorsSomethingElse(recolorerId, mechanicsByItem)) return true;
    const ownTags = itemsById.get(recolorerId)?.tags ?? [];
    return requiredTags.some((tag) => ownTags.includes(tag));
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
 * Draft one build per item that earns PlayerScore (a MechAddValue row with TargetType=PlayerScore). 7 fixed,
 * named levels, each computed straight from the root's own identity (levels 5 and 7's "activates an activator"
 * branch additionally read level-3's own identity) — deliberately not an open-ended recursive cascade.
 * Named/redefined by the user 2026-07-23, correcting an earlier round that conflated two different relationships
 * into one bucket:
 *
 *   1. Root — the item whose MechAddValue row earns PlayerScore; the build exists because of it.
 *   2. **Скейлеры денег** — items matching the Bonus filter's compound tag+type condition (collectScalers — "a
 *      Card tagged Rich", not "anything tagged Rich OR any Card"). Strictly the Bonus* columns
 *      (BonusCountingType/BonusTargetPlace/BonusTargetTag/...) — if the root's payoff row has none of them (just
 *      reads its own flat MainValue), this level is legitimately empty. Deliberately *not* the Activator filter
 *      at all anymore — that conflated "what's counted" with "what could satisfy the trigger", a real correction
 *      from an earlier round.
 *   3. **Скейлеры активаций** — items structurally producing the exact event the root's payoff listens for
 *      (producedActivatorType), filtered by tag compatibility: a producer naming a concrete *different* tag is
 *      excluded (provably can't match); a producer with **no** tag filter at all is a candidate, never excluded
 *      (indiscriminateProducersOfEvent) — real example: Гробовщик listens for *any* kill (doesn't care who died),
 *      so Маньяк/Killer (who kill with no TargetTag) are candidates. Board Place (Near/SameSide/OppositeCard/...)
 *      is never used to exclude either — any item can be placed on any of the 4 sides, so a self-relative Place
 *      filter can always be reconciled with the root's own Place filter by choosing where to put things; it's
 *      never proof of incompatibility. Also includes the item(s) *statically matching* the Activator filter's own
 *      tag with no id (itemIdsByTag) — not a producer, but the concrete thing the filter names (real example:
 *      Бездомный is level 3 for Чёрный рынок purely via ActivatorTag=Bum, even with zero Bonus fields on the
 *      root) — kept here deliberately even though it isn't literally "emitting" anything, since without it
 *      Бездомный (and everything that spawns him — see level 4) would silently vanish from this exact validated
 *      example; flag if this reads wrong, the alternative is a level of its own.
 *   4. **Спавнеры** — items placing the root (MechAddItem/ReplaceItem/ReplaceOnTrigger); items placing the
 *      level-2/3 members; and tag-granters producing a tag the root's own filters need. Purely about *placing*
 *      things onto the board — "activates the activators" moved to level 7 (a different verb, doesn't belong
 *      under a level literally named Spawners).
 *   5. **Перекрасивальщики** — a candidate lever wherever a color filter (root's own Bonus/Activator color, or a
 *      level-7 "activates an activator" member's own TargetColor — e.g. Тренер) can't rule out any literal color
 *      (RELATIVE_COLOR_VALUES) or names one explicitly. Tag-aware throughout via recolorerMatchesTagFilter (a
 *      self-only recolorer only counts if it's already the required tag — see Сумасшедший vs Сумасшедший+).
 *      Skipped for the root's own Activator color specifically when a *more specific* signal already resolved
 *      it precisely — a concrete UseActivatorIds, or ActivatorType=ColorChange (level 3 already finds the exact
 *      ColorChange producers). No such shortcut exists for the Bonus color (Bonus has no equivalent event).
 *   6. **Модификаторы** — items influencing the root's own parameters, most often MainValue: by id (targetersOf),
 *      by a tag matching root's own static tags (itemIdsByTargetedTag), or — generically — by type+position with
 *      no narrowing filter at all (genericValueBoostersByType). Real example: Эстакада boosts *any* nearby
 *      House's MainValue, Чёрный рынок included. Deliberately broad — safe specifically *because* it's the
 *      outermost level: it reads as a weak, wide-net connection, not a claim of the same strength as levels 2-4
 *      (unlike the same idea tried once as a standalone signal with no level structure around it — see
 *      relatedItems' history — which really did connect nearly everything to everything and was rejected for it).
 *   7. **Другие** — items that *activate* (not merely produce the event for) either a level-3 member or the root
 *      itself directly: by id, by tag, or — for the root specifically — generically by type+position
 *      (activatorsOf/itemIdsByActivatedTag/genericActivatorsByType). The "activates a level-3 member" case is a
 *      genuinely different relationship from level 3's "produces the event" (Тренер doesn't produce LoopCompleted
 *      — he fires an *extra* activation of Гонщик, who does); the "activates the root directly" case is a
 *      genuinely new relationship never modeled before this whole round at all (previously the only way to reach
 *      root was via level 3). Real example: Робот activates 2 random nearby Houses via MechActivate with no
 *      tag/id filter at all.
 *
 * A PlayerScore payoff row is only root-eligible when it modifies MainValue *and* the item has a real ValueMin/
 * ValueMax range configured (see isEligiblePayoffRow/hasNoRealMainValueRange) — a MoneyValue payoff (e.g. the
 * starting "Силуэт" character's flat starting-money stat) or a MainValue payoff on an item with no configured
 * value range at all (an engine-required placeholder mechanic — every item needs *some* mechanic to exist at
 * all — e.g. Бездомный/Заключенный/Уличный музыкант) are both baseline stats, not thematic payoffs, so both are
 * excluded by default. `includeMoneyValueRoots` opts back into both at once.
 */
/** The 7 level sets a root produces (see computeCascadeBuilds's doc for the full rule of each) — factored out of
 *  computeCascadeBuilds so computeCascadeLevels (per-build display, "Дерево связей") can compute the exact same
 *  classification for an *already-existing* build's root without duplicating this logic. */
/**
 * Every kind of "A helps B score more" relationship this app has validated against real data — now a single flat
 * enum instead of 7 fixed named categories, since (2026-07-24 redesign) the category a connection came through
 * matters less than *how far the connection is from the root*. Kept purely as a per-edge label for display
 * ("why is this connected"), not as the primary grouping axis anymore — see computeScalingGraph's doc.
 */
export type ScalingEdgeReason =
    | "money-scaler"
    | "activation-subject"
    | "event-producer"
    | "spawner"
    | "tag-granter"
    | "activator"
    | "modifier"
    | "recolorer"
    /** The item's *real* parent (from computeScalingGraph) isn't itself a member of this particular build — a
     *  manually-curated build can be a subset of what fresh generation would find — so computeCascadeLevels falls
     *  back to drawing a line straight to the root instead of leaving the node with nowhere to point. Rare. */
    | "indirect"
    /** Feeds a synthetic ReplaceItem combo node (see ComboInfo) — the ingredient side. */
    | "combo-ingredient"
    /** What a synthetic ReplaceItem combo node feeds into — the result side. */
    | "combo-result";

export const SCALING_EDGE_REASON_LABELS: Record<ScalingEdgeReason, string> = {
    "money-scaler": "считается в бонусе",
    "activation-subject": "то, что должно произойти (объект события)",
    "event-producer": "производит нужное событие",
    spawner: "спавнит/заменяет",
    "tag-granter": "даёт нужный тег",
    activator: "даёт доп. активацию",
    modifier: "напрямую повышает значение",
    recolorer: "перекрашивает под нужный цвет",
    indirect: "непрямая связь (через предмет вне билда)",
    "combo-ingredient": "ингредиент комбинации",
    "combo-result": "результат комбинации",
};

interface ScalingEdgeCandidate {
    from: string;
    reason: ScalingEdgeReason;
}

/**
 * Finds everything that structurally feeds into `target` — the generalized, recursive replacement for the old
 * per-root-only level computation. Applies uniformly to *any* item in the graph, root or not, using every one of
 * `targetRows` (target's own mechanic rows — an eligible PlayerScore payoff row for the root specifically, see
 * computeScalingGraph; every row it has for a non-root node, since a non-root node has no "payoff" concept to
 * restrict to). Checks every relationship kind this app has validated: counted in a Bonus filter, the concrete
 * tagged subject an Activator filter names, structurally producing the listened-for event (tag-checked — a
 * producer naming a *different* concrete tag is excluded, one naming no tag at all is a candidate), granting a
 * needed tag, spawning/replacing, firing an extra activation, directly raising a value, recoloring to satisfy a
 * tag+color filter (self-only recolorers only count if already the required tag — recolorerMatchesTagFilter).
 * Deliberately does NOT include "boosts/activates any nearby Card/House/Artefact, no tag, no id at all" — see the
 * module note by CascadeIndex for why that signal was tried and reverted.
 */
function findFeedersOf(
    target: Item,
    targetRows: MechanicRow[],
    index: CascadeIndex,
    itemsById: Map<string, Item>,
    mechanicsByItem: Map<string, MechanicRow[]>,
    knownIds: Set<string>
): ScalingEdgeCandidate[] {
    const edges: ScalingEdgeCandidate[] = [];
    const push = (from: string, reason: ScalingEdgeReason) => {
        if (from === target.id) return;
        edges.push({ from, reason });
    };

    for (const row of targetRows) {
        for (const id of collectScalers(index, { tag: row.fields.BonusTargetTag, type: row.fields.BonusTargetType })) {
            push(id, "money-scaler");
        }

        for (const tag of splitList(row.fields.ActivatorTag ?? "")) {
            for (const id of index.itemIdsByTag.get(tag) ?? []) push(id, "activation-subject");
        }

        for (const tag of [...splitList(row.fields.BonusTargetTag ?? ""), ...splitList(row.fields.ActivatorTag ?? "")]) {
            for (const id of index.itemIdsByGrantedTag.get(tag) ?? []) push(id, "tag-granter");
        }

        const activatorIds = splitList(row.fields.UseActivatorIds ?? "").filter((id) => knownIds.has(id));
        if (activatorIds.length > 0) {
            for (const id of activatorIds) push(id, "event-producer");
        } else if (row.fields.ActivatorType) {
            const activatorTags = splitList(row.fields.ActivatorTag ?? "");
            if (activatorTags.length > 0) {
                for (const tag of activatorTags) {
                    for (const id of index.itemIdsByProducedTaggedEvent.get(`${row.fields.ActivatorType}|${tag}`) ?? []) {
                        push(id, "event-producer");
                    }
                    for (const id of index.indiscriminateProducersOfEvent.get(row.fields.ActivatorType) ?? []) {
                        push(id, "event-producer");
                    }
                }
            } else {
                for (const id of index.itemIdsByProducedEvent.get(row.fields.ActivatorType) ?? []) push(id, "event-producer");
            }
        }

        const bonusTags = splitList(row.fields.BonusTargetTag ?? "");
        for (const color of splitList(row.fields.BonusTargetColor ?? "")) {
            for (const id of recolorersForColor(index, color)) {
                if (recolorerMatchesTagFilter(id, bonusTags, itemsById, mechanicsByItem)) push(id, "recolorer");
            }
        }

        // Activator color skipped when a more specific signal already resolves it — a concrete UseActivatorIds,
        // or ActivatorType=ColorChange (already exact via the event-producer branch above).
        const alreadyResolvedByEvent = row.fields.ActivatorType === "ColorChange";
        if (activatorIds.length === 0 && !alreadyResolvedByEvent) {
            const activatorTags = splitList(row.fields.ActivatorTag ?? "");
            for (const color of splitList(row.fields.ActivatorColor ?? "")) {
                for (const id of recolorersForColor(index, color)) {
                    if (recolorerMatchesTagFilter(id, activatorTags, itemsById, mechanicsByItem)) push(id, "recolorer");
                }
            }
        }

        // MechActivate's own Target color+tag (e.g. Тренер: TargetTag=Sport + TargetColor=Same) — recolorers that
        // could satisfy *this row's own* targeting condition, letting Тренер actually reach a matching target.
        if (row.table === "MechActivate") {
            const requiredTags = splitList(row.fields.TargetTag ?? "");
            for (const color of splitList(row.fields.TargetColor ?? "")) {
                for (const id of recolorersForColor(index, color)) {
                    if (recolorerMatchesTagFilter(id, requiredTags, itemsById, mechanicsByItem)) push(id, "recolorer");
                }
            }
        }
    }

    for (const id of index.spawnersOf.get(target.id) ?? []) push(id, "spawner");

    for (const id of index.activatorsOf.get(target.id) ?? []) push(id, "activator");
    for (const tag of target.tags) {
        for (const id of index.itemIdsByActivatedTag.get(tag) ?? []) push(id, "activator");
    }

    for (const id of index.targetersOf.get(target.id) ?? []) push(id, "modifier");
    for (const tag of target.tags) {
        for (const id of index.itemIdsByTargetedTag.get(tag) ?? []) push(id, "modifier");
    }

    return edges;
}

export interface ScalingNode {
    itemId: string;

    /** 0 = root; deeper = a more indirect, weaker lever on the root's score — it scales something that scales
     *  something (…) that scales the root, rather than scaling the root directly. */
    depth: number;

    /** The specific item(s) exactly one depth up that this node feeds into, and *why* (e.g. "spawns Маньяк",
     *  reason=spawner — not a flat "connects to root somehow"). Empty for the root. Multiple entries when the
     *  same item was independently discovered via more than one parent in the same BFS round. */
    parents: { itemId: string; reason: ScalingEdgeReason }[];
}

const DEFAULT_MAX_SCALING_DEPTH = 6;

/** The actual BFS, factored out so computeCascadeBuilds (many roots, one shared index) and computeCascadeLevels
 *  (one root, needs the index for other things too) don't each rebuild buildCascadeIndex per call. */
function computeScalingGraphInternal(
    rootId: string,
    knownIds: Set<string>,
    itemsById: Map<string, Item>,
    mechanicsByItem: Map<string, MechanicRow[]>,
    index: CascadeIndex,
    includeMoneyValueRoots: boolean,
    maxDepth: number
): Map<string, ScalingNode> {
    const nodes = new Map<string, ScalingNode>();
    const root = itemsById.get(rootId);
    if (!root) return nodes;
    nodes.set(rootId, { itemId: rootId, depth: 0, parents: [] });

    let frontier = [rootId];
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
        const discovered = new Map<string, { itemId: string; reason: ScalingEdgeReason }[]>();

        for (const parentId of frontier) {
            const parentItem = itemsById.get(parentId);
            if (!parentItem) continue;
            const rows =
                parentId === rootId
                    ? (mechanicsByItem.get(rootId) ?? []).filter((row) =>
                          isEligiblePayoffRow(root, row, includeMoneyValueRoots)
                      )
                    : mechanicsByItem.get(parentId) ?? [];

            for (const edge of findFeedersOf(parentItem, rows, index, itemsById, mechanicsByItem, knownIds)) {
                if (nodes.has(edge.from) || !knownIds.has(edge.from)) continue;
                if (!discovered.has(edge.from)) discovered.set(edge.from, []);
                discovered.get(edge.from)!.push({ itemId: parentId, reason: edge.reason });
            }
        }

        if (discovered.size === 0) break;

        const nextFrontier: string[] = [];
        for (const [itemId, parents] of discovered) {
            nodes.set(itemId, { itemId, depth, parents });
            nextFrontier.push(itemId);
        }
        frontier = nextFrontier;
    }

    return nodes;
}

/**
 * Recursively finds everything that scales `rootId`'s score, directly or by scaling something that itself scales
 * it — the 2026-07-24 redesign, replacing the earlier fixed 7-level model per the user's explicit design: "чем
 * ниже предмет, тем меньше он скейлит корень, но при этом они могут скейлить другие предметы, которые скейлят
 * корень". BFS outward from the root (see computeScalingGraphInternal): depth 1 = items with a real structural
 * edge (findFeedersOf) straight to the root's own eligible PlayerScore payoff row(s); depth 2 = items feeding
 * into a depth-1 item; and so on, capped at `maxDepth` purely as a safety valve against pathological/cyclic data
 * — real chains in the actual game bottom out within a few hops (e.g. Тренер feeding Гонщик feeding
 * Дальнобойщик is depth 2).
 *
 * Real example that motivated the redesign: the previous model's "boosts/activates any nearby Card/House/
 * Artefact, no tag, no id at all" signal (tried as a supposedly-safe outermost level) pulled Мошенник (drains
 * value from nearby Rich cards — nothing to do with killing) and Меценат (boosts any nearby card's value,
 * scaled by nearby Bum count — also nothing to do with killing) into "Билд от Гробовщика", alongside Эстакада
 * and Робот, purely because they share a board-slot category with the real feeders — no tag, no id, no actual
 * structural link. That signal is gone entirely now; only real edges (id/tag/event/replace-rule/tag-checked
 * recolor) are ever followed, so an item with no real connection to the root — direct or via a chain — simply
 * never appears, instead of appearing at a nominally "weak" outer level that still claimed a connection.
 */
export function computeScalingGraph(
    rootId: string,
    items: Item[],
    mechanics: MechanicRow[],
    replaceRules: ReplaceRule[],
    includeMoneyValueRoots = false,
    maxDepth = DEFAULT_MAX_SCALING_DEPTH
): Map<string, ScalingNode> {
    const knownIds = new Set(items.map((item) => item.id));
    const mechanicsByItem = groupByItemId(mechanics);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const index = buildCascadeIndex(items, mechanicsByItem, replaceRules, knownIds);
    return computeScalingGraphInternal(rootId, knownIds, itemsById, mechanicsByItem, index, includeMoneyValueRoots, maxDepth);
}

export function computeCascadeBuilds(
    items: Item[],
    mechanics: MechanicRow[],
    replaceRules: ReplaceRule[],
    existingBuilds: Build[],
    itemName: (item: Item) => string,
    includeMoneyValueRoots = false
): Build[] {
    const knownIds = new Set(items.map((item) => item.id));
    const mechanicsByItem = groupByItemId(mechanics);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const index = buildCascadeIndex(items, mechanicsByItem, replaceRules, knownIds);

    const roots = items.filter((item) =>
        (mechanicsByItem.get(item.id) ?? []).some((row) => isEligiblePayoffRow(item, row, includeMoneyValueRoots))
    );

    const existingItemSets = existingBuilds.map((build) => new Set(build.items));
    const drafts: Build[] = [];

    for (const root of roots) {
        const graph = computeScalingGraphInternal(
            root.id,
            knownIds,
            itemsById,
            mechanicsByItem,
            index,
            includeMoneyValueRoots,
            DEFAULT_MAX_SCALING_DEPTH
        );

        const clusterItems = [...graph.keys()];
        if (clusterItems.length < 2) continue;

        const alreadyCovered = existingItemSets.some(
            (existing) => existing.size === clusterItems.length && clusterItems.every((id) => existing.has(id))
        );
        if (alreadyCovered) continue;

        drafts.push({
            id: `cascade-${root.id}-${Math.random().toString(36).slice(2, 7)}`,
            name: `Билд от ${itemName(root)}`,
            items: clusterItems,
            auto: true,
        });
    }

    return drafts;
}

export interface ComboInfo {
    ruleId: string;

    /** itemIdToReplace + NeededItem — real build members, at least 2 of them. */
    ingredientIds: string[];

    /** The item the ingredients combine into (ReplaceItem's replacementItem). */
    resultId: string;
}

export interface CascadeLevelNode {
    /** A real Item.id, or a synthetic `combo:<ruleId>` id when `combo` is set (see ComboInfo). */
    itemId: string;

    /** 0 = the build's head item; deeper = a more indirect lever on the root's score (see ScalingNode). A combo
     *  node sits one depth past its result (it *feeds* the result) and one depth before its ingredients (they
     *  feed *it*) — see placeCombosInGraph. */
    depth: number;

    /** The specific member(s) one depth up that explain this node's presence, and why (see ScalingEdgeReason).
     *  Always `[]` for the root. Filtered to ids that are actually build members — a real parent that isn't
     *  itself curated into this particular build falls back to `[{itemId: rootId, reason: "indirect"}]`. A
     *  combo participant that *also* has a real structural edge elsewhere keeps that parent too — the combo
     *  edge is an addition, not a replacement (see placeCombosInGraph). */
    parents: { itemId: string; reason: ScalingEdgeReason }[];

    /** Present only for a synthetic combo node. */
    combo?: ComboInfo;
}

export interface CascadeLevelResult {
    /** Real items *and* synthetic combo nodes, all sharing one depth/parents graph — see placeCombosInGraph. */
    nodes: CascadeLevelNode[];

    /** Build members with no real path to the root at all (via computeScalingGraph), and not explained by a combo
     *  either — not explained by generation at all (e.g. manually added, or added by the separate tag/id-based
     *  computeSuggestedBuilds algorithm instead). */
    unclassified: string[];

    /** False when the build's head item has no PlayerScore-earning row at all (isEligiblePayoffRow) — there's no
     *  meaningful scaling graph without a real root, so every other member is reported as unclassified. */
    rootEligible: boolean;
}

/**
 * ReplaceItem rules where the item this build already exists to explain (the replacementItem) — or one of its
 * ingredients — is a build member, and at least 2 of {itemIdToReplace, NeededItem} are *also* build members. Real
 * example: Уличный музыкант + Продюсер (NeededItem) both being present is what turns him into Рок музыкант — a
 * genuine two-ingredient combination, not just "these two happen to be linked by a replace rule". Ported from the
 * now-deleted `buildTree.ts` unchanged — independent of the scaling graph, just needs build membership.
 */
function computeReplaceCombos(build: Build, replaceRules: ReplaceRule[]): ComboInfo[] {
    const memberIds = new Set(build.items);
    const combos: ComboInfo[] = [];
    const seenCombos = new Set<string>();

    for (const rule of replaceRules) {
        if (!memberIds.has(rule.replacementItem)) continue;

        const ingredientIds = [...new Set([rule.itemIdToReplace, rule.fields.NeededItem])]
            .filter((id): id is string => Boolean(id))
            .filter((id) => memberIds.has(id) && id !== rule.replacementItem);

        if (ingredientIds.length >= 2) {
            const comboKey = `${[...ingredientIds].sort().join(",")}->${rule.replacementItem}`;
            if (seenCombos.has(comboKey)) continue;
            seenCombos.add(comboKey);
            combos.push({ ruleId: rule.id, ingredientIds, resultId: rule.replacementItem });
        }
    }

    return combos;
}

/**
 * Folds combo bubbles directly into the *same* depth/parents graph the rest of the tree uses (2026-07-24 —
 * previously combos rendered as an entirely separate, disconnected section, specifically to dodge a DOM-ref
 * collision risk; re-integrated on request once a real per-node graph existed to integrate into cleanly).
 * Mutates `nodes` in place (adding combo nodes, and — for an ingredient that already has its own node elsewhere —
 * appending an *additional* parent entry to it, since a combo participant is never exclusively explained by the
 * combo: real example — Уличный музыкант's own "Music" tag can independently match some other build member's
 * filter at the same time his replace rule feeds a combo).
 *
 * A combo can only be anchored in the graph when its *result* already has a node — comboDepth = resultDepth + 1
 * (the combo feeds the result, one hop out), ingredientDepth = comboDepth + 1 (ingredients feed the combo, one
 * hop further). An ingredient with no node of its own yet gets a fresh one at that depth; one that's already
 * placed (found via a real structural edge) keeps its own depth and just gains the combo as a second parent. A
 * combo whose result has no node at all (rare — the result itself isn't reachable in the graph either) is
 * skipped entirely; its participants are left for the caller to report as `unclassified`.
 *
 * Returns the set of item ids successfully explained this way, so the caller can exclude them from `unclassified`.
 */
function placeCombosInGraph(nodes: CascadeLevelNode[], combos: ComboInfo[]): Set<string> {
    const nodeByItemId = new Map(nodes.map((node) => [node.itemId, node]));
    const placed = new Set<string>();

    for (const combo of combos) {
        const resultNode = nodeByItemId.get(combo.resultId);
        if (!resultNode) continue;

        const comboItemId = `combo:${combo.ruleId}`;
        const comboDepth = resultNode.depth + 1;
        const comboNode: CascadeLevelNode = {
            itemId: comboItemId,
            depth: comboDepth,
            parents: [{ itemId: combo.resultId, reason: "combo-result" }],
            combo,
        };
        nodes.push(comboNode);
        nodeByItemId.set(comboItemId, comboNode);
        placed.add(combo.resultId);

        for (const ingredientId of combo.ingredientIds) {
            const existing = nodeByItemId.get(ingredientId);
            if (existing) {
                existing.parents = [...existing.parents, { itemId: comboItemId, reason: "combo-ingredient" }];
            } else {
                const ingredientNode: CascadeLevelNode = {
                    itemId: ingredientId,
                    depth: comboDepth + 1,
                    parents: [{ itemId: comboItemId, reason: "combo-ingredient" }],
                };
                nodes.push(ingredientNode);
                nodeByItemId.set(ingredientId, ingredientNode);
            }
            placed.add(ingredientId);
        }
    }

    return placed;
}

/**
 * Classifies an *already-existing* build's own members by their depth in the same scaling graph
 * `computeCascadeBuilds` uses to decide build membership in the first place — informational/display only, does
 * not change the build. Replaces the old fixed-7-level classification (itself a replacement for an even older
 * BFS+item-type tiering, `computeBuildTree`) — see computeScalingGraph's doc for why depth replaced categories.
 *
 * Reuses `computeScalingGraphInternal` directly, so a member here is at depth N if and only if that's exactly the
 * distance computeCascadeBuilds' own graph would find for it, with `parents` pointing at the real, specific
 * item(s) one depth up (a spawner points at what it spawns, not at the root) — see ScalingNode. Combo nodes are
 * folded into the same `nodes` array by `placeCombosInGraph` — see its own doc for the depth/parent rules.
 */
export function computeCascadeLevels(
    build: Build,
    items: Item[],
    mechanics: MechanicRow[],
    replaceRules: ReplaceRule[],
    includeMoneyValueRoots = false
): CascadeLevelResult {
    if (build.items.length === 0) return { nodes: [], unclassified: [], rootEligible: false };

    const knownIds = new Set(items.map((item) => item.id));
    const mechanicsByItem = groupByItemId(mechanics);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const rootId = build.items[0];
    const root = itemsById.get(rootId);
    if (!root) return { nodes: [], unclassified: build.items, rootEligible: false };

    const combos = computeReplaceCombos(build, replaceRules);

    const payoffRows = (mechanicsByItem.get(root.id) ?? []).filter((row) =>
        isEligiblePayoffRow(root, row, includeMoneyValueRoots)
    );
    if (payoffRows.length === 0) {
        const nodes: CascadeLevelNode[] = [{ itemId: root.id, depth: 0, parents: [] }];
        const placed = placeCombosInGraph(nodes, combos);
        return {
            nodes,
            unclassified: build.items.filter((id) => id !== root.id && !placed.has(id)),
            rootEligible: false,
        };
    }

    const index = buildCascadeIndex(items, mechanicsByItem, replaceRules, knownIds);
    const graph = computeScalingGraphInternal(
        rootId,
        knownIds,
        itemsById,
        mechanicsByItem,
        index,
        includeMoneyValueRoots,
        DEFAULT_MAX_SCALING_DEPTH
    );

    const memberIds = new Set(build.items);
    const nodes: CascadeLevelNode[] = [];
    for (const [itemId, scalingNode] of graph) {
        if (!memberIds.has(itemId)) continue;
        const realParents = scalingNode.parents.filter((p) => p.itemId === rootId || memberIds.has(p.itemId));
        nodes.push({
            itemId,
            depth: scalingNode.depth,
            parents: itemId === rootId ? [] : realParents.length > 0 ? realParents : [{ itemId: rootId, reason: "indirect" }],
        });
    }

    const placed = placeCombosInGraph(nodes, combos);

    const unclassified = build.items.filter((id) => !graph.has(id) && !placed.has(id));
    return { nodes, unclassified, rootEligible: true };
}

/**
 * itemId -> ids of other items it structurally connects to via the same signals `computeCascadeBuilds`/
 * `computeScalingGraph` use (tag filters, tag-aware recolor matching, tagged/indiscriminate event producers) —
 * but computed generically for *any* mechanic row belonging to the item, not just a PlayerScore payoff row. Kept
 * in lockstep on purpose — `relatedItems`/`relatedBuilds`/`computeBuildConnections` (graph) all read this, and a
 * signal that generates a build but isn't visible here reads as a bug (real example that originally motivated
 * this whole function: Фермер/Ферма — see below). Deliberately does NOT include a generic "no tag, no id, just
 * type+position" match — see the module note by CascadeIndex for why that signal was tried and reverted.
 * Directional per row (owner -> match), callers should check both directions for an unordered "are these
 * connected" question, same as the existing direct-id-ref check does.
 */
function buildCascadeStyleConnections(items: Item[], mechanics: MechanicRow[]): Map<string, Set<string>> {
    const knownIds = new Set(items.map((item) => item.id));
    const mechanicsByItem = groupByItemId(mechanics);
    const index = buildCascadeIndex(items, mechanicsByItem, [], knownIds);
    const itemsById = new Map(items.map((item) => [item.id, item]));

    const connections = new Map<string, Set<string>>();
    const connect = (a: string, b: string) => {
        if (a === b) return;
        if (!connections.has(a)) connections.set(a, new Set());
        connections.get(a)!.add(b);
    };

    for (const [itemId, rows] of mechanicsByItem) {
        for (const row of rows) {
            if (row.table === "MechAddValue") {
                for (const tag of [
                    ...splitList(row.fields.BonusTargetTag ?? ""),
                    ...splitList(row.fields.ActivatorTag ?? ""),
                    ...splitList(row.fields.TargetTag ?? ""),
                ]) {
                    for (const id of index.itemIdsByTag.get(tag) ?? []) connect(itemId, id);
                    for (const id of index.itemIdsByGrantedTag.get(tag) ?? []) connect(itemId, id);
                }

                // Bonus color — tag-aware (recolorerMatchesTagFilter), same as computeCascadeBuilds' level 5.
                const bonusTags = splitList(row.fields.BonusTargetTag ?? "");
                for (const color of splitList(row.fields.BonusTargetColor ?? "")) {
                    for (const id of recolorersForColor(index, color)) {
                        if (recolorerMatchesTagFilter(id, bonusTags, itemsById, mechanicsByItem)) connect(itemId, id);
                    }
                }

                // Activator color — skipped when a more specific signal already resolves it (concrete
                // UseActivatorIds, or ActivatorType=ColorChange, already exact via the event-producer block below).
                const activatorIds = splitList(row.fields.UseActivatorIds ?? "").filter((id) => knownIds.has(id));
                const alreadyResolvedByEvent = row.fields.ActivatorType === "ColorChange";
                if (activatorIds.length === 0 && !alreadyResolvedByEvent) {
                    const activatorTags = splitList(row.fields.ActivatorTag ?? "");
                    for (const color of splitList(row.fields.ActivatorColor ?? "")) {
                        for (const id of recolorersForColor(index, color)) {
                            if (recolorerMatchesTagFilter(id, activatorTags, itemsById, mechanicsByItem)) connect(itemId, id);
                        }
                    }
                }

            }

            // MechActivate rows: an item that fires an *extra* activation of anything carrying a tag (e.g.
            // Тренер: TargetTag=Sport, no UseTargetIds) connects to its targets even with no id reference at all.
            if (row.table === "MechActivate") {
                for (const tag of [...splitList(row.fields.ActivatorTag ?? ""), ...splitList(row.fields.TargetTag ?? "")]) {
                    for (const id of index.itemIdsByTag.get(tag) ?? []) connect(itemId, id);
                    for (const id of index.itemIdsByGrantedTag.get(tag) ?? []) connect(itemId, id);
                }

                const activatorTags = splitList(row.fields.ActivatorTag ?? "");
                for (const color of splitList(row.fields.ActivatorColor ?? "")) {
                    for (const id of recolorersForColor(index, color)) {
                        if (recolorerMatchesTagFilter(id, activatorTags, itemsById, mechanicsByItem)) connect(itemId, id);
                    }
                }
                const targetTags = splitList(row.fields.TargetTag ?? "");
                for (const color of splitList(row.fields.TargetColor ?? "")) {
                    for (const id of recolorersForColor(index, color)) {
                        if (recolorerMatchesTagFilter(id, targetTags, itemsById, mechanicsByItem)) connect(itemId, id);
                    }
                }
            }

            if (row.fields.ActivatorType) {
                for (const tag of splitList(row.fields.ActivatorTag ?? "")) {
                    for (const id of index.itemIdsByProducedTaggedEvent.get(`${row.fields.ActivatorType}|${tag}`) ?? []) {
                        connect(itemId, id);
                    }
                    // A producer with no tag filter of its own can't be ruled out either — same relaxation as
                    // computeCascadeBuilds' level 3 (real example: Маньяк/Killer kill with no TargetTag at all).
                    for (const id of index.indiscriminateProducersOfEvent.get(row.fields.ActivatorType) ?? []) {
                        connect(itemId, id);
                    }
                }
            }
        }
    }

    return connections;
}

/**
 * Everything relatedItems() needs that depends only on (items, mechanics, upgradeChains, replaceRules) — not on
 * which itemId is being queried. Rebuilding these from scratch (grouping mechanics by item, the cascade index,
 * per-item id-ref/fingerprint sets, ...) is the expensive part; a single relatedItems() call only ever consumes a
 * few Map lookups' worth of it. Callers like computeBuildTree/relatedBuilds invoke relatedItems() once per build
 * member (10-20+ times per page), so recomputing this per call turned a single click into several seconds of
 * blocked main thread. Cached by reference identity of the four inputs — safe because GameStore only ever hands
 * out a new array reference for one of them when the underlying data actually changes (see GameStore.items).
 */
interface SharedRelationIndex {
    knownIds: Set<string>;
    chainMates: Map<string, Set<string>>;
    replaceMates: Map<string, Set<string>>;
    producedEvents: Map<string, Set<string>>;
    listenedEvents: Map<string, Set<string>>;
    cascadeStyleConnections: Map<string, Set<string>>;
    /** itemId -> raw (unfiltered) id-shaped tokens across all of its own mechanic rows' field values. */
    rawIdRefsByItem: Map<string, Set<string>>;
    fingerprintsByItem: Map<string, Set<string>>;
    excludedTiers: Set<string>;
}

let cachedRelationIndex: {
    items: Item[];
    mechanics: MechanicRow[];
    upgradeChains: UpgradeChain[];
    replaceRules: ReplaceRule[];
    index: SharedRelationIndex;
} | null = null;

function getSharedRelationIndex(
    items: Item[],
    mechanics: MechanicRow[],
    upgradeChains: UpgradeChain[],
    replaceRules: ReplaceRule[]
): SharedRelationIndex {
    const cached = cachedRelationIndex;
    if (
        cached &&
        cached.items === items &&
        cached.mechanics === mechanics &&
        cached.upgradeChains === upgradeChains &&
        cached.replaceRules === replaceRules
    ) {
        return cached.index;
    }

    const knownIds = new Set(items.map((item) => item.id));
    const mechanicsByItem = groupByItemId(mechanics);

    const rawIdRefsByItem = new Map<string, Set<string>>();
    const fingerprintsByItem = new Map<string, Set<string>>();
    for (const item of items) {
        const rows = mechanicsByItem.get(item.id) ?? [];
        rawIdRefsByItem.set(item.id, new Set(rows.flatMap((row) => Object.values(row.fields).flatMap(splitList))));
        fingerprintsByItem.set(item.id, fieldFingerprints(rows));
    }

    const index: SharedRelationIndex = {
        knownIds,
        chainMates: buildChainMates(upgradeChains),
        replaceMates: buildReplaceMates(replaceRules, knownIds),
        producedEvents: computeProducedEvents(mechanicsByItem),
        listenedEvents: computeListenedEvents(mechanicsByItem),
        cascadeStyleConnections: buildCascadeStyleConnections(items, mechanics),
        rawIdRefsByItem,
        fingerprintsByItem,
        excludedTiers: higherTierIds(upgradeChains),
    };

    cachedRelationIndex = { items, mechanics, upgradeChains, replaceRules, index };
    return index;
}

/** Ranked "possibly related" items for an item's detail page — informational only, never auto-clusters. */
export function relatedItems(
    itemId: string,
    items: Item[],
    mechanics: MechanicRow[],
    upgradeChains: UpgradeChain[],
    replaceRules: ReplaceRule[]
): RelatedItem[] {
    const {
        knownIds,
        chainMates,
        replaceMates,
        producedEvents,
        listenedEvents,
        cascadeStyleConnections,
        rawIdRefsByItem,
        fingerprintsByItem,
        excludedTiers,
    } = getSharedRelationIndex(items, mechanics, upgradeChains, replaceRules);

    const targetChainMates = chainMates.get(itemId) ?? new Set<string>();
    const targetReplaceMates = replaceMates.get(itemId) ?? new Set<string>();
    const targetProduces = producedEvents.get(itemId) ?? new Set<string>();
    const targetListens = listenedEvents.get(itemId) ?? new Set<string>();
    const targetCascadeLinks = cascadeStyleConnections.get(itemId) ?? new Set<string>();

    const targetIdRefs = new Set(
        [...(rawIdRefsByItem.get(itemId) ?? [])].filter((token) => knownIds.has(token) && token !== itemId)
    );
    const targetFingerprints = fingerprintsByItem.get(itemId) ?? new Set<string>();

    const results: RelatedItem[] = [];

    for (const other of items) {
        // Upgrade tiers (+/++) are power-scaled clones of the base item — noise here, not a distinct suggestion.
        if (other.id === itemId || excludedTiers.has(other.id)) continue;

        const reasons: string[] = [];
        let strength: "strong" | "weak" = "weak";
        let score = 0;

        const otherIdRefs = rawIdRefsByItem.get(other.id) ?? new Set<string>();

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

        const otherCascadeLinks = cascadeStyleConnections.get(other.id) ?? new Set<string>();
        if (targetCascadeLinks.has(other.id) || otherCascadeLinks.has(itemId)) {
            strength = "strong";
            score += 12;
            reasons.push("совпадает по тегу/цвету/событию в механике (как при генерации билдов)");
        }

        const otherFingerprints = fingerprintsByItem.get(other.id) ?? new Set<string>();
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

    /** 0..1 — size-normalized combination of literal overlap and bridging-item overlap (see the function doc). */
    strength: number;

    sharedItemCount: number;

    /** Items not literally shared, but strongly related to each other via the same signals `relatedBuilds`
     *  already uses on the build detail page (id refs, chains, replace rules, tag/color/event cascade signals) —
     *  see the function doc for why this is now part of the graph too. */
    bridgingItemCount: number;

    /** True if the user explicitly linked these builds (via GameStore.linkBuilds), regardless of item overlap. */
    manual: boolean;
}

/**
 * Build <-> Build edges for the graph: builds are connected if they share at least one item, if they have items
 * that are *strongly related* to each other without being literally shared (bridging items — the same concept
 * `relatedBuilds` already surfaces on the build detail page's "Возможно связано с" panel, now also driving the
 * graph itself so both places agree), or if the user manually linked them.
 *
 * Strength combines both kinds of overlap, size-normalized against the *smaller* of the two builds' item counts
 * (so a 10-item build sharing 1 item with a 2-item build still reads as weak) — bridging items are weighted at
 * 0.3x a literal shared item, matching the 10:3 ratio `relatedBuilds`' own scoring already uses, so a
 * bridging-only connection reads as visibly weaker than direct item overlap without being invisible.
 */
export function computeBuildConnections(
    builds: Build[],
    items: Item[],
    mechanics: MechanicRow[],
    upgradeChains: UpgradeChain[],
    replaceRules: ReplaceRule[]
): BuildConnection[] {
    const excludedTiers = higherTierIds(upgradeChains);
    const itemSets = new Map(
        builds.map((build) => [build.id, new Set(build.items.filter((id) => !excludedTiers.has(id)))])
    );

    // itemId -> ids strongly related to it (same signals relatedItems uses) — computed once per distinct item
    // across all builds, not once per build pair, since the same item can appear in many builds.
    const stronglyRelatedByItem = new Map<string, Set<string>>();
    const stronglyRelatedTo = (itemId: string): Set<string> => {
        const cached = stronglyRelatedByItem.get(itemId);
        if (cached) return cached;
        const strong = new Set(
            relatedItems(itemId, items, mechanics, upgradeChains, replaceRules)
                .filter((rel) => rel.strength === "strong")
                .map((rel) => rel.id)
        );
        stronglyRelatedByItem.set(itemId, strong);
        return strong;
    };

    // buildId -> union of "strongly related" ids across every item in that build — reused per pair below.
    const bridgingPoolByBuild = new Map<string, Set<string>>();
    const bridgingPoolOf = (buildId: string): Set<string> => {
        const cached = bridgingPoolByBuild.get(buildId);
        if (cached) return cached;
        const pool = new Set<string>();
        for (const itemId of itemSets.get(buildId) ?? []) {
            for (const id of stronglyRelatedTo(itemId)) pool.add(id);
        }
        bridgingPoolByBuild.set(buildId, pool);
        return pool;
    };

    const connections: BuildConnection[] = [];

    for (let i = 0; i < builds.length; i++) {
        for (let j = i + 1; j < builds.length; j++) {
            const buildA = builds[i];
            const buildB = builds[j];
            const itemsA = itemSets.get(buildA.id)!;
            const itemsB = itemSets.get(buildB.id)!;

            const sharedItemCount = [...itemsA].filter((id) => itemsB.has(id)).length;
            const bridgingItemCount = [...itemsB].filter(
                (id) => !itemsA.has(id) && bridgingPoolOf(buildA.id).has(id)
            ).length;
            const manual =
                (buildA.manualLinks ?? []).includes(buildB.id) || (buildB.manualLinks ?? []).includes(buildA.id);

            if (sharedItemCount === 0 && bridgingItemCount === 0 && !manual) continue;

            const minSize = Math.min(itemsA.size, itemsB.size) || 1;
            const overlapStrength =
                sharedItemCount === 0 && bridgingItemCount === 0 ? 1 : sharedItemCount / minSize + (bridgingItemCount / minSize) * 0.3;
            const strength = Math.min(overlapStrength, 1);

            connections.push({ source: buildA.id, target: buildB.id, strength, sharedItemCount, bridgingItemCount, manual });
        }
    }

    return connections;
}
