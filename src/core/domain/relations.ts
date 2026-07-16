import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { MechanicRow } from "../models/Mechanic";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { ReplaceRule } from "../models/ReplaceRule";
import { MECHANIC_TAG_FIELDS } from "./mechanicTables";

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

/**
 * Tags "relevant" to an item = its own ItemTag list, plus every tag value
 * that item's own mechanics reference as a filter (ActivatorTag/TargetTag/
 * BonusTargetTag). This is what connects e.g. a "fuel producer" (whose
 * mechanic targets tag=Fuel) to a "fuel consumer" (whose mechanic activates
 * on tag=Fuel) even though neither references the other's Id directly.
 */
function computeTagSets(items: Item[], mechanicsByItem: Map<string, MechanicRow[]>): Map<string, Set<string>> {
    const tagSets = new Map<string, Set<string>>();

    for (const item of items) {
        const tags = new Set(item.tags);
        for (const mechanic of mechanicsByItem.get(item.id) ?? []) {
            for (const field of MECHANIC_TAG_FIELDS) {
                const value = mechanic.fields[field];
                if (value) splitList(value).forEach((tag) => tags.add(tag));
            }
        }
        tagSets.set(item.id, tags);
    }

    return tagSets;
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
 * Draft Build clusters from strong signals only: items sharing a relevant
 * tag, items whose mechanics reference another item's Id directly
 * (UseTargetIds, MechAddItem's NewItemId, etc. — detected generically by
 * scanning field values against known item Ids), items linked by a
 * ReplaceItem/ReplaceOnTrigger rule, or items that are tiers of the same
 * upgrade chain.
 *
 * These are a starting point, not a final answer — a common tag can pull
 * unrelated items into one cluster, so the user is expected to split/merge/
 * rename drafts on the Builds page rather than accept them as-is.
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
    const tagSets = computeTagSets(items, mechanicsByItem);

    const unionFind = new UnionFind();
    for (const item of items) unionFind.find(item.id);

    const idsByTag = new Map<string, string[]>();
    for (const [id, tags] of tagSets) {
        for (const tag of tags) {
            if (!idsByTag.has(tag)) idsByTag.set(tag, []);
            idsByTag.get(tag)!.push(id);
        }
    }
    for (const ids of idsByTag.values()) {
        for (let i = 1; i < ids.length; i++) unionFind.union(ids[0], ids[i]);
    }

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
    const tagSets = computeTagSets(items, mechanicsByItem);
    const chainMates = buildChainMates(upgradeChains);
    const targetChainMates = chainMates.get(itemId) ?? new Set<string>();
    const replaceMates = buildReplaceMates(replaceRules, knownIds);
    const targetReplaceMates = replaceMates.get(itemId) ?? new Set<string>();

    const targetTags = tagSets.get(itemId) ?? new Set<string>();
    const targetMechanics = mechanicsByItem.get(itemId) ?? [];
    const targetIdRefs = new Set(
        targetMechanics.flatMap((mechanic) =>
            Object.values(mechanic.fields)
                .flatMap(splitList)
                .filter((token) => knownIds.has(token) && token !== itemId)
        )
    );
    const targetFingerprints = fieldFingerprints(targetMechanics);

    const results: RelatedItem[] = [];

    for (const other of items) {
        if (other.id === itemId) continue;

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

        const otherTags = tagSets.get(other.id) ?? new Set<string>();
        const sharedTags = [...targetTags].filter((tag) => otherTags.has(tag));
        if (sharedTags.length > 0) {
            strength = "strong";
            score += sharedTags.length * 5;
            reasons.push(`общие теги: ${sharedTags.join(", ")}`);
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
