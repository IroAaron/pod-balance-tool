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
