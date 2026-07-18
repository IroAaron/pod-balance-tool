import { describe, expect, it } from "vitest";
import { computeCascadeBuilds } from "./relations";
import type { Item } from "../models/Item";
import type { MechanicRow } from "../models/Mechanic";

/**
 * Regression coverage for computeCascadeBuilds' root-eligibility rule, which took several failed attempts to
 * get right (see project memory for the full history — TargetValueType alone, then Activator/Bonus field
 * presence, then a description-text check, each failed on a real example a previous round had gotten right).
 * The fixtures below mirror the exact field shapes of the real, validated items from the actual game data, so a
 * future change to this logic can be checked against known-correct behavior without re-fetching CSVs.
 */

function makeItem(id: string, overrides: Partial<Item> = {}): Item {
    return { id, tags: [], raw: {}, nameKey: id, ...overrides };
}

function makeMainValuePayoff(itemId: string, fields: Record<string, string> = {}): MechanicRow {
    return {
        id: `${itemId}-payoff`,
        table: "MechAddValue",
        itemId,
        fields: {
            TargetType: "PlayerScore",
            TargetValueType: "MainValue",
            ActivatorType: "BallPass",
            ActivatorPlace: "MyPosition",
            ...fields,
        },
    };
}

function rootsOf(items: Item[], mechanics: MechanicRow[], includeMoneyValueRoots = false): Set<string> {
    const drafts = computeCascadeBuilds(
        items,
        mechanics,
        [],
        [],
        (item) => item.id,
        () => undefined,
        includeMoneyValueRoots
    );
    return new Set(drafts.map((draft) => draft.items[0]));
}

describe("computeCascadeBuilds root eligibility", () => {
    it("excludes MainValue payoffs on items with no real ValueMin/ValueMax range (real Бездомный/Заключенный/Уличный музыкант shape)", () => {
        const homeless = makeItem("homeless", { valueMin: 0, valueMax: 0 }); // real: ValueMin=0, ValueMax=0
        const prisoner = makeItem("prisoner", { valueMin: 0, valueMax: 0 }); // real: ValueMin=0, ValueMax=0
        const streetMusician = makeItem("street_musician"); // real: both blank -> undefined here
        const items = [homeless, prisoner, streetMusician];
        const mechanics = items.map((item) => makeMainValuePayoff(item.id));

        const roots = rootsOf(items, mechanics);

        for (const item of items) {
            expect(roots.has(item.id)).toBe(false);
        }
    });

    it("includes real thematic payoffs with a configured value range (real Footballer/Artist/Police officer/Rock musician shape)", () => {
        const footballer = makeItem("footballer", { tags: ["Sport", "Soccer"], valueMin: 5, valueMax: 5 });
        const artist = makeItem("artist", { valueMin: 5, valueMax: 5 });
        const policeOfficer = makeItem("police_officer", { valueMin: 15, valueMax: 15 });
        const rockMusician = makeItem("rock_musician", { valueMin: 15, valueMax: 15 });
        const soccerScaler = makeItem("soccer_scaler", { tags: ["Soccer"] });
        const colorProducer = makeItem("color_producer");
        const criminalItem = makeItem("criminal_item", { tags: ["Criminal"] });
        const musicScaler = makeItem("music_scaler", { tags: ["Music"] });

        const items = [footballer, artist, policeOfficer, rockMusician, soccerScaler, colorProducer, criminalItem, musicScaler];
        const mechanics = [
            makeMainValuePayoff(footballer.id, { BonusTargetTag: "Soccer", BonusCountingType: "CellCount" }),
            makeMainValuePayoff(artist.id, { ActivatorType: "ColorChange", ActivatorPlace: "All" }),
            makeMainValuePayoff(policeOfficer.id, { ActivatorType: "ItemRemoved", ActivatorTag: "Criminal" }),
            makeMainValuePayoff(rockMusician.id, { BonusTargetTag: "Music", BonusCountingType: "CellCount" }),
            { id: "color_producer-effect", table: "MechChangeColor", itemId: colorProducer.id, fields: { NewColor: "Red" } },
        ];

        const roots = rootsOf(items, mechanics);

        expect(roots.has(footballer.id)).toBe(true);
        expect(roots.has(artist.id)).toBe(true);
        expect(roots.has(policeOfficer.id)).toBe(true);
        expect(roots.has(rockMusician.id)).toBe(true);
    });

    it("KNOWN ACCEPTED GAP: an item with a nonzero ValueMin/ValueMax still passes even if it's actually a flat payoff (real Producer shape)", () => {
        // Producer (c_chel_money_2_1) has ValueMin=5, ValueMax=5 in the real data despite its description
        // confirming it's exactly as flat as Бездомный/Заключенный ("Дает ${MoneyValue}", no dynamic value
        // mentioned). The user explicitly chose the structural ValueMin/ValueMax rule over a description-text
        // check, accepting this specific false positive. This test documents that choice — if it starts
        // failing, ValueMin/ValueMax stopped matching Producer's real data, not that the rule itself broke.
        const producer = makeItem("producer", { valueMin: 5, valueMax: 5 });
        const scaler = makeItem("producer_scaler", { tags: ["Rich"] });
        const mechanics = [makeMainValuePayoff(producer.id, { BonusTargetTag: "Rich", BonusCountingType: "CellCount" })];

        const roots = rootsOf([producer, scaler], mechanics);

        expect(roots.has(producer.id)).toBe(true);
    });

    it("includes flat payoffs (ValueMin=ValueMax=0) when includeMoneyValueRoots is true", () => {
        const item = makeItem("homeless2", { valueMin: 0, valueMax: 0 });
        const scaler = makeItem("homeless2_scaler", { tags: ["Bum"] });
        const mechanics = [makeMainValuePayoff(item.id, { BonusTargetTag: "Bum" })];

        const roots = rootsOf([item, scaler], mechanics, true);

        expect(roots.has(item.id)).toBe(true);
    });
});
