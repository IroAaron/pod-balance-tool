import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { MechanicRow } from "../models/Mechanic";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { ReplaceRule } from "../models/ReplaceRule";
import { relatedItems } from "./relations";

export interface ComboInfo {
    ruleId: string;

    /** itemIdToReplace + NeededItem — real build members, at least 2 of them (a lone itemIdToReplace with no
     *  in-build NeededItem is just a plain transformation, not a "combination", and stays a normal direct edge). */
    ingredientIds: string[];

    /** The item the ingredients combine into (ReplaceItem's replacementItem). */
    resultId: string;
}

export interface BuildTreeNode {
    /** A real Item.id, or a synthetic `combo:<ruleId>` id when `combo` is set. */
    itemId: string;

    /** 0 = the build's head item; 1 = direct Card connection to it; 2 = direct House/Artefact connection to it; 3+ = indirect, by BFS distance. */
    tier: number;

    /** Id(s) of the already-placed item(s)/combo node one tier up that this node connected through. */
    parents: string[];

    /** Present only for a synthetic "combo" node — see buildComboIndex. */
    combo?: ComboInfo;
}

export interface BuildTreeResult {
    nodes: BuildTreeNode[];

    /** Build members with no discoverable direct/indirect connection to the head item at all. */
    unconnected: string[];
}

const COMBO_ID_PREFIX = "combo:";

/** True for a synthetic combo node's id (see BuildTreeNode.combo) — exported so UI code (edge coloring: orange
 *  into a combo, green out of one) doesn't have to duplicate the `combo:` prefix convention. */
export function isComboNodeId(id: string): boolean {
    return id.startsWith(COMBO_ID_PREFIX);
}

/**
 * ReplaceItem rules where the item this build already exists to explain (the replacementItem) — or one of its
 * ingredients — is a build member, and at least 2 of {itemIdToReplace, NeededItem} are *also* build members. Real
 * example: Уличный музыкант + Продюсер (NeededItem) both being present is what turns him into Рок музыкант — a
 * genuine two-ingredient combination, not just "these two happen to be linked by a replace rule" (a single
 * itemIdToReplace with no in-build NeededItem doesn't get this treatment, see ComboInfo).
 */
function computeReplaceCombos(build: Build, replaceRules: ReplaceRule[]): ComboInfo[] {
    const memberIds = new Set(build.items);
    const combos: ComboInfo[] = [];
    // The real ReplaceItem sheet has literal duplicate rows for the same (itemIdToReplace, NeededItem,
    // replacementItem) triple (e.g. one row per upgrade-tier variant of the same NeededItem) — dedupe by the
    // ingredient set + result, not by rule.id, so that doesn't render as two identical combo bubbles.
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
 * Tiers a build's own member items by connection-distance from the build's head item (build.items[0]), per the
 * user's spec:
 *   Tier 0 — the head item itself.
 *   Tier 1 — Card-type items with a *direct* connection to the head.
 *   Tier 2 — House/Artefact-type items with a *direct* connection to the head.
 *   Tier 3+ — items with no direct connection to the head, but a direct connection to some item already placed
 *     in an earlier tier (plain BFS by distance from here on — distance 2 from the head is tier 3, distance 3 is
 *     tier 4, etc.; the user's spec only named tiers up to "third-rate" but described the underlying rule
 *     generically enough that it naturally keeps going if the real data has deeper chains).
 *
 * "Direct connection" reuses relatedItems()'s existing *strong* signals (direct id references, shared upgrade
 * chain, produced/listened mechanic events, and — since 2026-07 — the same tag/color/tagged-event matching
 * computeCascadeBuilds uses) — deliberately not shared tags alone, which were removed from every other connection
 * signal in this app for being too weak/noisy (see relations.ts). Scoped to pairs that are both already members
 * of this build — this visualizes the build's existing curated membership, it does not go looking for new items
 * to pull in from the wider item pool.
 *
 * ReplaceItem *combinations* (2+ ingredients producing a result, all 3 build members — see computeReplaceCombos)
 * are a special case: instead of three flat pairwise edges (ingredient↔ingredient, each ingredient↔result, which
 * is what relatedItems()'s replace-rule signal alone would otherwise draw), they render through one synthetic
 * "combo" node — ingredients and result each connect only to the combo node, not directly to each other. The
 * combo node is discovered like any other node, from *whichever* participant (an ingredient, or the result) the
 * BFS reaches first — often the result, when it's the tree's own root, since replace-mate is otherwise a strong
 * signal straight from the root. That's deliberate: it lets "root ← combo ← ingredients" and "ingredients → combo
 * → deeper result" both fall out of the same rule, without hardcoding which side is "upstream".
 */
export function computeBuildTree(
    build: Build,
    items: Item[],
    mechanics: MechanicRow[],
    upgradeChains: UpgradeChain[],
    replaceRules: ReplaceRule[]
): BuildTreeResult {
    if (build.items.length === 0) return { nodes: [], unconnected: [] };

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const rootId = build.items[0];
    const memberIds = new Set(build.items);

    const directConnections = new Map<string, Set<string>>();
    for (const id of build.items) {
        const strongIds = new Set(
            relatedItems(id, items, mechanics, upgradeChains, replaceRules)
                .filter((rel) => rel.strength === "strong" && memberIds.has(rel.id))
                .map((rel) => rel.id)
        );
        directConnections.set(id, strongIds);
    }

    const combos = computeReplaceCombos(build, replaceRules);
    const comboById = new Map(combos.map((combo) => [combo.ruleId, combo]));
    const combosByParticipant = new Map<string, ComboInfo[]>();
    for (const combo of combos) {
        for (const participantId of [...combo.ingredientIds, combo.resultId]) {
            if (!combosByParticipant.has(participantId)) combosByParticipant.set(participantId, []);
            combosByParticipant.get(participantId)!.push(combo);
        }
    }

    // Combo participants connect only through their synthetic combo node now, not as flat pairwise edges.
    const removePair = (a: string, b: string) => {
        directConnections.get(a)?.delete(b);
        directConnections.get(b)?.delete(a);
    };
    for (const combo of combos) {
        const participants = [...combo.ingredientIds, combo.resultId];
        for (let i = 0; i < participants.length; i++) {
            for (let j = i + 1; j < participants.length; j++) {
                removePair(participants[i], participants[j]);
            }
        }
    }

    const nodes: BuildTreeNode[] = [{ itemId: rootId, tier: 0, parents: [] }];
    const placedTier = new Map<string, number>([[rootId, 0]]);
    const placedComboIds = new Set<string>();

    let frontier = [rootId];
    let nextTier = 1;

    while (frontier.length > 0) {
        // candidateId (real item id, or a synthetic combo id) -> which frontier item(s) reached it this round.
        const discovered = new Map<string, string[]>();
        const addDiscovery = (candidateId: string, parentId: string) => {
            if (placedTier.has(candidateId)) return;
            if (!discovered.has(candidateId)) discovered.set(candidateId, []);
            if (!discovered.get(candidateId)!.includes(parentId)) discovered.get(candidateId)!.push(parentId);
        };

        for (const parentId of frontier) {
            if (parentId.startsWith(COMBO_ID_PREFIX)) {
                // A placed combo node radiates out to whichever of its participants aren't placed yet.
                const combo = comboById.get(parentId.slice(COMBO_ID_PREFIX.length));
                if (combo) {
                    for (const participantId of [...combo.ingredientIds, combo.resultId]) {
                        addDiscovery(participantId, parentId);
                    }
                }
                continue;
            }

            for (const neighborId of directConnections.get(parentId) ?? []) {
                addDiscovery(neighborId, parentId);
            }

            // Any not-yet-placed combo this item participates in (as ingredient or result) becomes reachable too.
            for (const combo of combosByParticipant.get(parentId) ?? []) {
                if (placedComboIds.has(combo.ruleId)) continue;
                addDiscovery(`${COMBO_ID_PREFIX}${combo.ruleId}`, parentId);
            }
        }

        if (discovered.size === 0) break;

        const place = (id: string, tier: number, parents: string[]) => {
            if (id.startsWith(COMBO_ID_PREFIX)) {
                const ruleId = id.slice(COMBO_ID_PREFIX.length);
                nodes.push({ itemId: id, tier, parents, combo: comboById.get(ruleId) });
                placedComboIds.add(ruleId);
            } else {
                nodes.push({ itemId: id, tier, parents });
            }
            placedTier.set(id, tier);
        };

        if (nextTier === 1) {
            // Distance-1-from-root splits into two visual tiers by item type — both computed from this same
            // first BFS round, so Card and House/Artefact candidates share the same parent (the root). Combo
            // nodes have no itemType of their own, so they fall into the second (House/Artefact) tier here.
            const cardIds = [...discovered.keys()].filter(
                (id) => !id.startsWith(COMBO_ID_PREFIX) && itemsById.get(id)?.itemType === "Card"
            );
            const otherIds = [...discovered.keys()].filter((id) => !cardIds.includes(id));

            for (const id of cardIds) place(id, 1, discovered.get(id)!);
            for (const id of otherIds) place(id, 2, discovered.get(id)!);

            frontier = [...cardIds, ...otherIds];
            nextTier = 3;
        } else {
            const ids = [...discovered.keys()];
            for (const id of ids) place(id, nextTier, discovered.get(id)!);

            frontier = ids;
            nextTier += 1;
        }
    }

    const unconnected = build.items.filter((id) => !placedTier.has(id));

    return { nodes, unconnected };
}
