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

    it("extracts a non-blank TempDeck column into tempDeckId", () => {
        const classified = classifyTable(
            table([
                {
                    RoundId: "round_with_shop_deck",
                    RoundRules: "",
                    AdditionalInvisibleArtefact: "",
                    TempDeck: "chel_start_deck",
                    DeckBalls: "",
                    DeckBalls_1: "",
                    DeckBalls_2: "",
                    DeckBalls_3: "",
                },
            ])
        );

        const { data } = normalizeClassifiedTables([classified]);

        expect(data.rounds[0].tempDeckId).toBe("chel_start_deck");
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

describe("BallGroups", () => {
    it("classifies as BallGroups, not Decks — DeckId+Ball columns disambiguate from DeckId+Item", () => {
        const table: ParsedTable = {
            sourceName: "BallGroups",
            headers: ["DeckId", "Ball", "Ball_1", "Ball_2"],
            rows: [],
        };

        expect(classifyTable(table).type).toBe("BallGroups");
    });

    it("groups the wide repeated Ball columns into one ordered ballIds array per DeckId, filtering blanks", () => {
        const classified = {
            type: "BallGroups" as const,
            table: {
                sourceName: "BallGroups",
                headers: ["DeckId", "Ball", "Ball_1", "Ball_2", "Ball_3"],
                rows: [
                    {
                        DeckId: "ball_deck_basic",
                        Ball: "standart_ball_red",
                        Ball_1: "standart_ball_blue",
                        Ball_2: "",
                        Ball_3: "standart_ball_green",
                    },
                ],
            },
        };

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(warnings).toEqual([]);
        expect(data.ballGroups).toEqual([
            {
                id: "ball_deck_basic",
                ballIds: ["standart_ball_red", "standart_ball_blue", "standart_ball_green"],
            },
        ]);
    });

    it("warns and yields no ball groups when DeckId column is missing", () => {
        const classified = {
            type: "BallGroups" as const,
            table: {
                sourceName: "BallGroups",
                headers: ["Ball"],
                rows: [{ Ball: "standart_ball_red" }],
            },
        };

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(data.ballGroups).toEqual([]);
        expect(warnings).toEqual([
            { sourceName: "BallGroups", message: "Не найдена колонка DeckId — таблица колод шаров пропущена" },
        ]);
    });
});

describe("Sprints", () => {
    // Real header shape: SprintId + 9 repeated "RoundSettings" columns, renamed by Papa.parse to RoundSettings,
    // RoundSettings_1..RoundSettings_8. PacksDeck/Shops are real columns too but confirmed out of scope with the
    // user — deliberately included here to prove they're never read into the model.
    const headers = [
        "SprintId",
        "RoundNumber",
        "Quota",
        "Stage",
        "RewardTickerts",
        "RewardTicketsPerBall",
        "RewardPack",
        "HousesInShop",
        "Shops",
        "PackDeckStart",
        "PacksDeck",
        "RoundSettings",
        "RoundSettings_1",
        "RoundSettings_2",
        "RoundSettings_3",
        "RoundSettings_4",
        "RoundSettings_5",
        "RoundSettings_6",
        "RoundSettings_7",
        "RoundSettings_8",
    ];

    function table(rows: Record<string, string>[]): ParsedTable {
        return { sourceName: "Sprints", headers, rows };
    }

    it("classifies a SprintId-headered sheet as Sprints", () => {
        expect(classifyTable(table([])).type).toBe("Sprints");
    });

    it("groups rows by SprintId, sorts by RoundNumber regardless of row order, and never reads PacksDeck/Shops", () => {
        // Fed out of order (RoundNumber 3 before 1) to prove the sort-by-RoundNumber step actually runs.
        const classified = classifyTable(
            table([
                {
                    SprintId: "main_sprint",
                    RoundNumber: "3",
                    Quota: "1000",
                    Stage: "1",
                    RewardTickerts: "10",
                    RewardTicketsPerBall: "10",
                    RewardPack: "artefact_pack",
                    HousesInShop: "shop_houses1_2",
                    Shops: "shop_3",
                    PackDeckStart: "start_field_fill_pack",
                    PacksDeck: "field_fill_1",
                    RoundSettings: "round_one_ball_mult_speed",
                    RoundSettings_1: "round_black_white_0",
                    RoundSettings_2: "",
                    RoundSettings_3: "",
                    RoundSettings_4: "",
                    RoundSettings_5: "",
                    RoundSettings_6: "",
                    RoundSettings_7: "",
                    RoundSettings_8: "",
                },
                {
                    SprintId: "main_sprint",
                    RoundNumber: "1",
                    Quota: "200",
                    Stage: "1",
                    RewardTickerts: "10",
                    RewardTicketsPerBall: "10",
                    RewardPack: "",
                    HousesInShop: "shop_houses1_0",
                    Shops: "shop_1",
                    PackDeckStart: "start_field_fill_pack",
                    PacksDeck: "field_fill_start",
                    RoundSettings: "standart_in_a_activate_all_top_per_loop",
                    RoundSettings_1: "standart_in_a_activate_all_left_per_loop",
                    RoundSettings_2: "standart_in_a_money_for_kill_chel_up_side",
                    RoundSettings_3: "standart_in_a_money_for_kill_chel_right_side",
                    RoundSettings_4: "standart_in_a_money_for_kill_chel_bottom_side",
                    RoundSettings_5: "standart_in_a_money_for_kill_chel_left_side",
                    RoundSettings_6: "standart_in_a_activate_angle_chels_for_ball_stop",
                    RoundSettings_7: "standart_in_a_value_to_angle_chels_for_activate_angle_chel",
                    RoundSettings_8: "",
                },
            ])
        );

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(warnings).toEqual([]);
        expect(data.sprints).toHaveLength(1);
        const sprint = data.sprints[0];
        expect(sprint.id).toBe("main_sprint");
        expect(sprint.rounds).toHaveLength(2);

        // RoundNumber 1 sorted first despite arriving second in the input.
        expect(sprint.rounds[0]).toEqual({
            id: sprint.rounds[0].id,
            quota: 200,
            stage: 1,
            rewardTickets: 10,
            rewardTicketsPerBall: 10,
            rewardPackId: undefined,
            housesInShopPackId: "shop_houses1_0",
            packDeckStartId: "start_field_fill_pack",
            roundIds: [
                "standart_in_a_activate_all_top_per_loop",
                "standart_in_a_activate_all_left_per_loop",
                "standart_in_a_money_for_kill_chel_up_side",
                "standart_in_a_money_for_kill_chel_right_side",
                "standart_in_a_money_for_kill_chel_bottom_side",
                "standart_in_a_money_for_kill_chel_left_side",
                "standart_in_a_activate_angle_chels_for_ball_stop",
                "standart_in_a_value_to_angle_chels_for_activate_angle_chel",
            ],
        });

        expect(sprint.rounds[1]).toEqual({
            id: sprint.rounds[1].id,
            quota: 1000,
            stage: 1,
            rewardTickets: 10,
            rewardTicketsPerBall: 10,
            rewardPackId: "artefact_pack",
            housesInShopPackId: "shop_houses1_2",
            packDeckStartId: "start_field_fill_pack",
            roundIds: ["round_one_ball_mult_speed", "round_black_white_0"],
        });

        // PacksDeck ("field_fill_1"/"field_fill_start") and Shops ("shop_1"/"shop_3") values never surface anywhere.
        const serialized = JSON.stringify(data.sprints);
        expect(serialized).not.toContain("field_fill_1");
        expect(serialized).not.toContain("field_fill_start");
        expect(serialized).not.toContain("shop_1\"");
        expect(serialized).not.toContain("shop_3");
    });

    it("preserves a round id that repeats within one row's RoundSettings pool (confirmed real data, not deduped)", () => {
        const classified = classifyTable(
            table([
                {
                    SprintId: "main_sprint",
                    RoundNumber: "8",
                    Quota: "7000",
                    Stage: "2",
                    RewardTickerts: "10",
                    RewardTicketsPerBall: "10",
                    RewardPack: "",
                    HousesInShop: "shop_houses1_2",
                    Shops: "shop_4",
                    PackDeckStart: "start_field_fill_pack",
                    PacksDeck: "field_fill_2",
                    RoundSettings: "standart_in_a_money_for_bandits",
                    RoundSettings_1: "standart_in_a_money_for_blue",
                    RoundSettings_2: "standart_in_a_left_green_houses_plus_value_for_start_spin",
                    RoundSettings_3: "standart_in_a_left_green_houses_plus_value_for_start_spin",
                    RoundSettings_4: "standart_in_a_activate_angle_chels_for_ball_stop",
                    RoundSettings_5: "standart_in_a_value_to_angle_chels_for_activate_angle_chel",
                    RoundSettings_6: "",
                    RoundSettings_7: "",
                    RoundSettings_8: "",
                },
            ])
        );

        const { data } = normalizeClassifiedTables([classified]);

        expect(data.sprints[0].rounds[0].roundIds).toEqual([
            "standart_in_a_money_for_bandits",
            "standart_in_a_money_for_blue",
            "standart_in_a_left_green_houses_plus_value_for_start_spin",
            "standart_in_a_left_green_houses_plus_value_for_start_spin",
            "standart_in_a_activate_angle_chels_for_ball_stop",
            "standart_in_a_value_to_angle_chels_for_activate_angle_chel",
        ]);
    });

    it("warns and yields no sprints when SprintId column is missing", () => {
        const classified = { type: "Sprints" as const, table: table([{ RoundNumber: "1" } as Record<string, string>]) };
        classified.table.headers = classified.table.headers.filter((h) => h !== "SprintId");

        const { data, warnings } = normalizeClassifiedTables([classified]);

        expect(data.sprints).toEqual([]);
        expect(warnings).toEqual([
            { sourceName: "Sprints", message: "Не найдена колонка SprintId — таблица забегов пропущена" },
        ]);
    });
});

describe("Unknown tables", () => {
    const unknownTable = (sourceName: string) => ({
        type: "Unknown" as const,
        table: { sourceName, headers: ["Название иконки", "Размер"], rows: [{ "Название иконки": "Бургер", "Размер": "40" }] },
    });

    it("warns about a genuinely unrecognized tab", () => {
        const { warnings } = normalizeClassifiedTables([unknownTable("ЧтоТоНовое")]);

        expect(warnings).toEqual([
            { sourceName: "ЧтоТоНовое", message: "Не удалось определить тип таблицы — данные не загружены" },
        ]);
    });

    it("stays quiet about tabs the site deliberately doesn't consume", () => {
        // "Словарь значков" ships in the real translations sheet and can never classify — warning about it on
        // every download is a false alarm on an otherwise successful import.
        expect(normalizeClassifiedTables([unknownTable("Словарь значков")]).warnings).toEqual([]);
        // Matched by tab name, so a manually-uploaded CSV ("<Spreadsheet> - <Tab>.csv") is recognized too.
        expect(normalizeClassifiedTables([unknownTable("PoD_ переводы - Словарь значков")]).warnings).toEqual([]);
    });
});
