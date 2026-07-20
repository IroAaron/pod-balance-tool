import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { MechanicRow } from "../models/Mechanic";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { ReplaceRule } from "../models/ReplaceRule";
import { relatedItems } from "./relations";

export interface BuildTreeNode {
    itemId: string;

    /** 0 = the build's head item; 1 = direct Card connection to it; 2 = direct House/Artefact connection to it; 3+ = indirect, by BFS distance. */
    tier: number;

    /** Id(s) of the already-placed item(s) one tier up that this node connected through. */
    parents: string[];
}

export interface BuildTreeResult {
    nodes: BuildTreeNode[];

    /** Build members with no discoverable direct/indirect connection to the head item at all. */
    unconnected: string[];
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
 * "Direct connection" reuses relatedItems()'s existing *strong* signals only (direct id references, shared
 * upgrade chain, replace-rule link, produced/listened mechanic events) — deliberately not shared tags, which
 * were removed from every other connection signal in this app for being too weak/noisy (see relations.ts).
 * Scoped to pairs that are both already members of this build — this visualizes the build's existing curated
 * membership, it does not go looking for new items to pull in from the wider item pool.
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

    const nodes: BuildTreeNode[] = [{ itemId: rootId, tier: 0, parents: [] }];
    const placedTier = new Map<string, number>([[rootId, 0]]);

    let frontier = [rootId];
    let nextTier = 1;

    while (frontier.length > 0) {
        // candidateId -> which frontier item(s) reached it this round.
        const discovered = new Map<string, string[]>();
        for (const parentId of frontier) {
            for (const neighborId of directConnections.get(parentId) ?? []) {
                if (placedTier.has(neighborId)) continue;
                if (!discovered.has(neighborId)) discovered.set(neighborId, []);
                discovered.get(neighborId)!.push(parentId);
            }
        }

        if (discovered.size === 0) break;

        if (nextTier === 1) {
            // Distance-1-from-root splits into two visual tiers by item type — both computed from this same
            // first BFS round, so Card and House/Artefact candidates share the same parent (the root).
            const cardIds = [...discovered.keys()].filter((id) => itemsById.get(id)?.itemType === "Card");
            const otherIds = [...discovered.keys()].filter((id) => itemsById.get(id)?.itemType !== "Card");

            for (const id of cardIds) {
                nodes.push({ itemId: id, tier: 1, parents: discovered.get(id)! });
                placedTier.set(id, 1);
            }
            for (const id of otherIds) {
                nodes.push({ itemId: id, tier: 2, parents: discovered.get(id)! });
                placedTier.set(id, 2);
            }

            frontier = [...cardIds, ...otherIds];
            nextTier = 3;
        } else {
            const ids = [...discovered.keys()];
            for (const id of ids) {
                nodes.push({ itemId: id, tier: nextTier, parents: discovered.get(id)! });
                placedTier.set(id, nextTier);
            }

            frontier = ids;
            nextTier += 1;
        }
    }

    const unconnected = build.items.filter((id) => !placedTier.has(id));

    return { nodes, unconnected };
}
