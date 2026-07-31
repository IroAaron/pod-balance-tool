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
