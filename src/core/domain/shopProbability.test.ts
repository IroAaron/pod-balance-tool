import { describe, expect, it } from "vitest";
import { computeShopAppearanceProbabilities, isShopSlotPack } from "./shopProbability";
import type { Pack } from "../models/Pack";
import type { ShopDeckEntry } from "../models/ShopDeck";

function makeDeck(deckId: string, itemIds: string[], weight?: number): ShopDeckEntry[] {
    return itemIds.map((itemId, index) => ({ id: `${deckId}:${index}`, deckId, itemId, weight }));
}

describe("isShopSlotPack", () => {
    it("accepts real shop-offered pack ids, rejects deterministic starting-setup ones", () => {
        expect(isShopSlotPack({ id: "1", packId: "shop_houses1_0", sourceDeckId: "d" })).toBe(true);
        expect(isShopSlotPack({ id: "2", packId: "shop_card_law_and_order", sourceDeckId: "d" })).toBe(true);
        expect(isShopSlotPack({ id: "3", packId: "artefact_pack_stage_1", sourceDeckId: "d" })).toBe(true);
        expect(isShopSlotPack({ id: "4", packId: "start_deck", sourceDeckId: "d" })).toBe(false);
        expect(isShopSlotPack({ id: "5", packId: "field_fill_1", sourceDeckId: "d" })).toBe(false);
    });
});

describe("computeShopAppearanceProbabilities", () => {
    it("without replacement, equal (unweighted) deck — real shop_houses shape: draws/poolSize per item", () => {
        // Real house packs have blank Weight (uniform) and blank UseWeights/AllowDuplicates.
        const deckEntries = makeDeck("houses", ["h1", "h2", "h3", "h4"], 10);
        const pack: Pack = { id: "p1", packId: "shop_houses1_0", sourceDeckId: "houses", itemNumber: 2 };

        const result = computeShopAppearanceProbabilities([pack], deckEntries);

        // Only 1 eligible pack, so perSlot == withinPack: 2 draws / 4 items = 0.5.
        expect(result.get("h1")!.perSlotProbability).toBeCloseTo(0.5);
        expect(result.get("h1")!.perVisitProbability).toBeCloseTo(1 - Math.pow(0.5, 3)); // 0.875
        expect(result.get("h1")!.packs).toEqual([{ packId: "shop_houses1_0", deckId: "houses", withinPackProbability: 0.5 }]);
    });

    it("with replacement (allowDuplicates), weighted deck — real shop_card shape uses geometric formula", () => {
        const deckEntries = makeDeck("chels", ["c1", "c2", "c3", "c4"], 25);
        const pack: Pack = {
            id: "p1",
            packId: "shop_card_law_and_order",
            sourceDeckId: "chels",
            itemNumber: 4,
            allowDuplicates: true,
            useWeights: true,
        };

        const result = computeShopAppearanceProbabilities([pack], deckEntries);

        // share = 25/100 = 0.25; P(at least one hit in 4 draws with replacement) = 1 - 0.75^4.
        expect(result.get("c1")!.perSlotProbability).toBeCloseTo(1 - Math.pow(0.75, 4));
    });

    it("ignores start_deck/field_fill_* packs entirely — not in the eligible pool, no contribution", () => {
        const shopDeck = makeDeck("houses", ["h1"], 10);
        const startDeck = makeDeck("char_1_deck_1", ["only_in_start_deck"], 10);

        const shopPack: Pack = { id: "p1", packId: "shop_houses1_0", sourceDeckId: "houses", itemNumber: 1 };
        const startPack: Pack = { id: "p2", packId: "start_deck", sourceDeckId: "char_1_deck_1", itemNumber: 1 };

        const result = computeShopAppearanceProbabilities([shopPack, startPack], [...shopDeck, ...startDeck]);

        expect(result.has("only_in_start_deck")).toBe(false);
        // eligibleCount must be 1 (only shop_houses1_0), not 2 — h1 gets the full within-pack probability, not halved.
        expect(result.get("h1")!.perSlotProbability).toBeCloseTo(1); // 1 draw / 1 item
    });

    it("averages across every eligible pack for the uniform pack-pool slot assumption, then combines 3 slots", () => {
        const deckA = makeDeck("deckA", ["target", "other_a"], undefined);
        const deckB = makeDeck("deckB", ["b1", "b2"], undefined);

        const packA: Pack = { id: "p1", packId: "shop_a", sourceDeckId: "deckA", itemNumber: 1 };
        const packB: Pack = { id: "p2", packId: "shop_b", sourceDeckId: "deckB", itemNumber: 1 };

        const result = computeShopAppearanceProbabilities([packA, packB], [...deckA, ...deckB]);

        // withinPack("target", packA) = 1/2 = 0.5; only appears in packA, 2 eligible packs total.
        // perSlot = 0.5 / 2 = 0.25; perVisit = 1 - (1-0.25)^3 = 0.578125.
        expect(result.get("target")!.perSlotProbability).toBeCloseTo(0.25);
        expect(result.get("target")!.perVisitProbability).toBeCloseTo(1 - Math.pow(0.75, 3));
    });

    it("a pack whose sourceDeckId has no matching DecksShop rows contributes nothing (real data-gap case)", () => {
        const pack: Pack = { id: "p1", packId: "artefact_pack_stage_2", sourceDeckId: "artefact_deck_stage_2", itemNumber: 3 };
        const result = computeShopAppearanceProbabilities([pack], []);
        expect(result.size).toBe(0);
    });
});
