import { describe, expect, it } from "vitest";
import { classifyTable } from "./tableClassifier";
import { normalizeClassifiedTables } from "./normalize";
import type { ParsedTable } from "./types";

describe("RoundSettings", () => {
    // Real header shape: Papa.parse({header:true}) renames the sheet's 10 repeated "DeckBalls" columns to
    // DeckBalls, DeckBalls_1, ..., DeckBalls_9 (verified separately against papaparse's actual behavior).
    const headers = [
        "RoundId",
        "RoundRules",
        "AdditionalInvisibleArtefact",
        "TempDeck",
        "DeckBalls",
        "DeckBalls_1",
        "DeckBalls_2",
        "DeckBalls_3",
    ];

    function table(rows: Record<string, string>[]): ParsedTable {
        return { sourceName: "RoundSettings", headers, rows };
    }

    it("classifies a RoundId-headered sheet as RoundSettings", () => {
        const classified = classifyTable(table([]));
        expect(classified.type).toBe("RoundSettings");
    });

    it("parses real-shaped rows, including one with blank RoundRules and a gappy DeckBalls tail", () => {
        const classified = classifyTable(
            table([
                {
                    RoundId: "round_one_ball_mult_speed",
                    RoundRules: "Marathon",
                    AdditionalInvisibleArtefact: "in_a_one_ball_mult_speed",
                    TempDeck: "",
                    DeckBalls: "standart_ball_marathon",
                    DeckBalls_1: "",
                    DeckBalls_2: "",
                    DeckBalls_3: "",
                },
                {
                    RoundId: "standart_in_a_money_for_bandits",
                    RoundRules: "",
                    AdditionalInvisibleArtefact: "in_a_money_for_bandits",
                    TempDeck: "",
                    DeckBalls: "standart_balls_0_1",
                    DeckBalls_1: "standart_balls_0_2",
                    DeckBalls_2: "standart_balls_0_3",
                    DeckBalls_3: "standart_balls_0_4",
                },
            ])
        );

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(warnings).toEqual([]);
        expect(data.rounds).toEqual([
            {
                id: "round_one_ball_mult_speed",
                rules: "Marathon",
                invisibleArtefactId: "in_a_one_ball_mult_speed",
                deckBalls: ["standart_ball_marathon"],
                descKey: "round_one_ball_mult_speed_desc",
                raw: {
                    RoundId: "round_one_ball_mult_speed",
                    RoundRules: "Marathon",
                    AdditionalInvisibleArtefact: "in_a_one_ball_mult_speed",
                    TempDeck: "",
                    DeckBalls: "standart_ball_marathon",
                    DeckBalls_1: "",
                    DeckBalls_2: "",
                    DeckBalls_3: "",
                },
            },
            {
                id: "standart_in_a_money_for_bandits",
                rules: undefined,
                invisibleArtefactId: "in_a_money_for_bandits",
                deckBalls: ["standart_balls_0_1", "standart_balls_0_2", "standart_balls_0_3", "standart_balls_0_4"],
                descKey: "standart_in_a_money_for_bandits_desc",
                raw: {
                    RoundId: "standart_in_a_money_for_bandits",
                    RoundRules: "",
                    AdditionalInvisibleArtefact: "in_a_money_for_bandits",
                    TempDeck: "",
                    DeckBalls: "standart_balls_0_1",
                    DeckBalls_1: "standart_balls_0_2",
                    DeckBalls_2: "standart_balls_0_3",
                    DeckBalls_3: "standart_balls_0_4",
                },
            },
        ]);
    });

    it("warns and yields no rounds when RoundId is missing entirely", () => {
        const classified = { type: "RoundSettings" as const, table: table([{ RoundRules: "Marathon" } as Record<string, string>]) };
        // Force-drop RoundId from headers to simulate a sheet that somehow lost its id column post-classification.
        classified.table.headers = classified.table.headers.filter((h) => h !== "RoundId");

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(data.rounds).toEqual([]);
        expect(warnings).toEqual([
            { sourceName: "RoundSettings", message: "Не найдена колонка RoundId — таблица раундов пропущена" },
        ]);
    });
});

describe("Decks / DecksShop", () => {
    // Real header shape — identical for both tables, only the sheet's own tab name tells them apart.
    const headers = ["DeckId", "Item", "Weight", "Cost"];

    function table(sourceName: string, rows: Record<string, string>[]): ParsedTable {
        return { sourceName, headers, rows };
    }

    it("classifies by sheet name, not columns, since both tables share identical headers", () => {
        expect(classifyTable(table("PoD_ конфигурации. Баланс_ Пистолет 2 - Decks", [])).type).toBe("Decks");
        expect(classifyTable(table("PoD_ конфигурации. Баланс_ Пистолет 2 - DecksShop", [])).type).toBe("DecksShop");
        expect(classifyTable(table("Decks", [])).type).toBe("Decks");
        expect(classifyTable(table("DecksShop", [])).type).toBe("DecksShop");
    });

    it("groups rows by DeckId, preserving real triplicate rows as distinct entries (not deduplicated)", () => {
        // Real shape from chel_start_deck: c_chel_money_1_1 appears 3 times with the same Weight — confirmed with
        // the user this represents 3 copies of the card in the starting deck, not a data artifact, so the
        // normalizer must never collapse duplicate (DeckId, Item) rows.
        const classified = classifyTable(
            table("DecksShop", [
                { DeckId: "chel_start_deck", Item: "c_chel_money_1_1", Weight: "10", Cost: "" },
                { DeckId: "chel_start_deck", Item: "c_chel_money_1_1", Weight: "10", Cost: "" },
                { DeckId: "chel_start_deck", Item: "c_chel_money_1_1", Weight: "10", Cost: "" },
                { DeckId: "chel_start_deck", Item: "c_chel_money_2_1", Weight: "10", Cost: "" },
                { DeckId: "shop_deck_houses_1_0", Item: "h_money_for_activate_bum_same_side", Weight: "10", Cost: "5" },
            ])
        );

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(warnings).toEqual([]);
        expect(data.decks).toHaveLength(2);

        const startDeck = data.decks.find((deck) => deck.id === "chel_start_deck")!;
        expect(startDeck.source).toBe("DecksShop");
        expect(startDeck.entries).toHaveLength(4);
        expect(startDeck.entries.filter((entry) => entry.itemId === "c_chel_money_1_1")).toHaveLength(3);
        expect(new Set(startDeck.entries.map((entry) => entry.id)).size).toBe(4); // every entry gets a distinct local id

        const shopDeck = data.decks.find((deck) => deck.id === "shop_deck_houses_1_0")!;
        expect(shopDeck.entries).toEqual([
            { id: shopDeck.entries[0].id, itemId: "h_money_for_activate_bum_same_side", weight: 10, cost: 5 },
        ]);
    });

    it("blank Weight/Cost parse as undefined, not 0", () => {
        const classified = classifyTable(
            table("Decks", [{ DeckId: "artefact_deck", Item: "a_vip_ticket", Weight: "", Cost: "" }])
        );

        const { data } = normalizeClassifiedTables([classified]);

        expect(data.decks).toEqual([
            {
                id: "artefact_deck",
                source: "Decks",
                entries: [{ id: data.decks[0].entries[0].id, itemId: "a_vip_ticket", weight: undefined, cost: undefined }],
            },
        ]);
    });

    it("warns and yields no decks when DeckId/Item columns are missing", () => {
        const classified = { type: "Decks" as const, table: table("Decks", [{ Weight: "10" } as Record<string, string>]) };
        classified.table.headers = classified.table.headers.filter((h) => h !== "DeckId");

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(data.decks).toEqual([]);
        expect(warnings).toEqual([
            { sourceName: "Decks", message: "Не найдены колонки DeckId/Item — таблица колод пропущена" },
        ]);
    });
});

describe("Packs", () => {
    const headers = [
        "PackId",
        "Cost",
        "ItemsToTake",
        "SourceDeckId",
        "UseWeights",
        "AllowDuplicates",
        "ItemNumber",
        "ItemCount",
        "ItemWeight",
        "ItemCost",
        "MetaTag",
    ];

    function table(rows: Record<string, string>[]): ParsedTable {
        return { sourceName: "Packs", headers, rows };
    }

    it("classifies a PackId-headered sheet as Packs", () => {
        expect(classifyTable(table([])).type).toBe("Packs");
    });

    it("groups rows by PackId — pack-level fields captured once, per-source fields kept per row (real start_deck shape)", () => {
        // Real shape: start_deck has 3 rows (one per source deck) — Cost/ItemsToTake/UseWeights/AllowDuplicates
        // blank/consistent across all 3, SourceDeckId/ItemNumber/ItemCount/ItemWeight differ per row. Confirmed
        // with the user this pack-level/per-entry split is the real design, not row-per-pack.
        const classified = classifyTable(
            table([
                {
                    PackId: "start_deck",
                    Cost: "",
                    ItemsToTake: "",
                    SourceDeckId: "char_1_deck_1",
                    UseWeights: "",
                    AllowDuplicates: "",
                    ItemNumber: "1",
                    ItemCount: "2",
                    ItemWeight: "55",
                    ItemCost: "",
                    MetaTag: "",
                },
                {
                    PackId: "start_deck",
                    Cost: "",
                    ItemsToTake: "",
                    SourceDeckId: "char_1_deck_2",
                    UseWeights: "",
                    AllowDuplicates: "",
                    ItemNumber: "1",
                    ItemCount: "2",
                    ItemWeight: "35",
                    ItemCost: "",
                    MetaTag: "",
                },
                {
                    PackId: "start_deck",
                    Cost: "",
                    ItemsToTake: "",
                    SourceDeckId: "char_1_deck_3",
                    UseWeights: "",
                    AllowDuplicates: "",
                    ItemNumber: "1",
                    ItemCount: "1",
                    ItemWeight: "10",
                    ItemCost: "",
                    MetaTag: "",
                },
                {
                    PackId: "shop_sticker1",
                    Cost: "6",
                    ItemsToTake: "1",
                    SourceDeckId: "shop_deck_stickers",
                    UseWeights: "",
                    AllowDuplicates: "1",
                    ItemNumber: "3",
                    ItemCount: "1",
                    ItemWeight: "",
                    ItemCost: "",
                    MetaTag: "",
                },
            ])
        );

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(warnings).toEqual([]);
        expect(data.packs).toHaveLength(2);

        const startDeck = data.packs.find((pack) => pack.id === "start_deck")!;
        expect(startDeck.cost).toBeUndefined();
        expect(startDeck.itemsToTake).toBeUndefined();
        expect(startDeck.useWeights).toBeUndefined();
        expect(startDeck.allowDuplicates).toBeUndefined();
        expect(startDeck.sources).toHaveLength(3);
        expect(startDeck.sources.map((s) => s.sourceDeckId)).toEqual(["char_1_deck_1", "char_1_deck_2", "char_1_deck_3"]);
        expect(startDeck.sources.map((s) => s.itemWeight)).toEqual([55, 35, 10]);
        expect(new Set(startDeck.sources.map((s) => s.id)).size).toBe(3);

        const sticker = data.packs.find((pack) => pack.id === "shop_sticker1")!;
        expect(sticker.cost).toBe(6);
        expect(sticker.itemsToTake).toBe(1);
        expect(sticker.allowDuplicates).toBe(true);
        expect(sticker.useWeights).toBeUndefined();
        expect(sticker.sources).toEqual([
            {
                id: sticker.sources[0].id,
                sourceDeckId: "shop_deck_stickers",
                itemNumber: 3,
                itemCount: 1,
                itemWeight: undefined,
                itemCost: undefined,
            },
        ]);
    });

    it("parses a negative ItemNumber correctly, not dropped as falsy", () => {
        const classified = classifyTable(
            table([
                {
                    PackId: "field_fill_1",
                    Cost: "",
                    ItemsToTake: "",
                    SourceDeckId: "chel_deck_1",
                    UseWeights: "",
                    AllowDuplicates: "",
                    ItemNumber: "-1",
                    ItemCount: "1",
                    ItemWeight: "",
                    ItemCost: "",
                    MetaTag: "",
                },
            ])
        );

        const { data } = normalizeClassifiedTables([classified]);

        expect(data.packs[0].sources[0].itemNumber).toBe(-1);
    });

    it("warns and yields no packs when PackId/SourceDeckId columns are missing", () => {
        const classified = {
            type: "Packs" as const,
            table: table([{ Cost: "1" } as Record<string, string>]),
        };
        classified.table.headers = classified.table.headers.filter((h) => h !== "PackId");

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(data.packs).toEqual([]);
        expect(warnings).toEqual([
            { sourceName: "Packs", message: "Не найдены колонки PackId/SourceDeckId — таблица паков пропущена" },
        ]);
    });
});

describe("Balls", () => {
    const headers = [
        "ItemId",
        "RunMin",
        "RunMax",
        "InertiaMin",
        "InertiaMax",
        "ValueMin",
        "ValueMax",
        "Color",
        "MetaTag",
    ];

    function table(rows: Record<string, string>[]): ParsedTable {
        return { sourceName: "Balls", headers, rows };
    }

    it("classifies as Balls, NOT Items — real ItemId+MetaTag columns would otherwise trip the Items tag/type fallback", () => {
        // ItemId matches findIdColumn's exact check, and "MetaTag" contains the substring "tag", so without
        // Balls' own early signature branch this table would be misclassified as Items by the generic fallback.
        expect(classifyTable(table([])).type).toBe("Balls");
    });

    it("parses real-shaped rows, including the comma-decimal Inertia values", () => {
        const classified = classifyTable(
            table([
                {
                    ItemId: "standart_ball_red",
                    RunMin: "56",
                    RunMax: "70",
                    InertiaMin: "0,4",
                    InertiaMax: "0,6",
                    ValueMin: "0",
                    ValueMax: "0",
                    Color: "Red",
                    MetaTag: "",
                },
            ])
        );

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(warnings).toEqual([]);
        expect(data.balls).toEqual([
            {
                id: "standart_ball_red",
                runMin: 56,
                runMax: 70,
                inertiaMin: 0.4,
                inertiaMax: 0.6,
                valueMin: 0,
                valueMax: 0,
                color: "Red",
                metaTag: undefined,
                nameKey: "standart_ball_red",
                descKey: "standart_ball_red_desc",
            },
        ]);
    });

    it("warns and yields no balls when ItemId column is missing", () => {
        const classified = { type: "Balls" as const, table: table([{ RunMin: "56" } as Record<string, string>]) };
        classified.table.headers = classified.table.headers.filter((h) => h !== "ItemId");

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(data.balls).toEqual([]);
        expect(warnings).toEqual([
            { sourceName: "Balls", message: "Не найдена колонка ItemId — таблица шаров пропущена" },
        ]);
    });
});
