import type { Pack } from "../models/Pack";
import type { ShopDeckEntry } from "../models/ShopDeck";

/** A shop visit shows this many random pack slots — see project notes/plan for the source of this number
 *  (confirmed by the user, not derivable from any exported sheet). */
const SHOP_SLOTS_PER_VISIT = 3;

interface DeckPool {
    entries: { itemId: string; weight: number }[];

    totalWeight: number;
}

/** Groups DecksShop rows by deck, defaulting a blank Weight to 1 (uniform) — see ShopDeckEntry.weight. */
function buildDeckPools(entries: ShopDeckEntry[]): Map<string, DeckPool> {
    const byDeck = new Map<string, { itemId: string; weight: number }[]>();
    for (const entry of entries) {
        const list = byDeck.get(entry.deckId);
        const row = { itemId: entry.itemId, weight: entry.weight ?? 1 };
        if (list) list.push(row);
        else byDeck.set(entry.deckId, [row]);
    }

    const pools = new Map<string, DeckPool>();
    for (const [deckId, rows] of byDeck) {
        pools.set(deckId, { entries: rows, totalWeight: rows.reduce((sum, row) => sum + row.weight, 0) });
    }
    return pools;
}

/**
 * Packs actually offered as one of the random shop slots — identified by PackId naming convention, since the real
 * data has no explicit "is this a shop pack" flag: `shop_*`/`artefact_pack*` are real shop offers (house packs,
 * chel/card packs, sticker packs, artefact packs); `start_deck`/`field_fill_*`/`start_field_fill_pack` are the
 * deterministic starting-board/starting-deck setup, never a random shop draw (confirmed against the full real
 * PackId list — see project plan).
 */
export function isShopSlotPack(pack: Pack): boolean {
    return pack.packId.startsWith("shop_") || pack.packId.startsWith("artefact_pack");
}

export interface ItemShopAppearance {
    itemId: string;

    /** Every eligible shop pack whose deck contains this item, with the odds of it being drawn given that pack
     *  was the one shown. */
    packs: { packId: string; deckId: string; withinPackProbability: number }[];

    /** P(item appears via one specific shop slot) — averaged over every eligible pack (uniform pack-pool
     *  assumption, see isShopSlotPack's doc and the project plan for why). */
    perSlotProbability: number;

    /** P(item appears at least once among the SHOP_SLOTS_PER_VISIT slots shown in a single shop visit). */
    perVisitProbability: number;
}

/**
 * P(this item's own pack is drawn) given a pack is chosen — a hypergeometric-style ("no duplicates") or geometric
 * ("duplicates allowed") draw of `pack.itemNumber` items from its source deck, weighted by ShopDeckEntry.weight
 * (ignored entirely when `pack.useWeights` is falsy, per that column's own meaning — every entry in the deck is
 * then equally likely regardless of its stored weight).
 *
 * The "no duplicates" branch (`share × draws`, capped at 1) is exact for equal weights (matches the plain
 * hypergeometric inclusion probability k/N) — which is what every real deck seen so far actually has — and a
 * reasonable approximation otherwise; a fully exact weighted-without-replacement inclusion probability would need
 * an order-dependent recursive computation, not worth the complexity for a balance heuristic.
 */
function withinPackProbability(pack: Pack, pool: DeckPool, weight: number): number {
    const draws = pack.itemNumber ?? 0;
    if (draws <= 0 || pool.totalWeight <= 0) return 0;

    const effectiveWeight = pack.useWeights ? weight : 1;
    const effectiveTotal = pack.useWeights ? pool.totalWeight : pool.entries.length;
    const share = effectiveWeight / effectiveTotal;

    return pack.allowDuplicates ? 1 - Math.pow(1 - share, draws) : Math.min(1, share * draws);
}

/**
 * Computes, per item, the chance it appears at least once in a single shop visit (SHOP_SLOTS_PER_VISIT random pack
 * slots) — see the module doc and the project plan for the full model. Packs whose sourceDeckId has no matching
 * DecksShop rows (real data gap, e.g. artefact_deck and the stage-2/3 house decks, as of this writing) simply
 * contribute nothing — not an error, and other packs/items are unaffected.
 */
export function computeShopAppearanceProbabilities(
    packs: Pack[],
    shopDeckEntries: ShopDeckEntry[]
): Map<string, ItemShopAppearance> {
    const pools = buildDeckPools(shopDeckEntries);
    const eligiblePacks = packs.filter(isShopSlotPack);
    const eligibleCount = eligiblePacks.length;

    const byItem = new Map<string, ItemShopAppearance>();
    if (eligibleCount === 0) return byItem;

    for (const pack of eligiblePacks) {
        const pool = pools.get(pack.sourceDeckId);
        if (!pool) continue;

        for (const entry of pool.entries) {
            const probability = withinPackProbability(pack, pool, entry.weight);
            if (probability <= 0) continue;

            const existing = byItem.get(entry.itemId) ?? {
                itemId: entry.itemId,
                packs: [],
                perSlotProbability: 0,
                perVisitProbability: 0,
            };
            existing.packs.push({ packId: pack.packId, deckId: pack.sourceDeckId, withinPackProbability: probability });
            existing.perSlotProbability += probability / eligibleCount;
            byItem.set(entry.itemId, existing);
        }
    }

    for (const appearance of byItem.values()) {
        appearance.perSlotProbability = Math.min(1, appearance.perSlotProbability);
        appearance.perVisitProbability = 1 - Math.pow(1 - appearance.perSlotProbability, SHOP_SLOTS_PER_VISIT);
    }

    return byItem;
}
