import { describe, expect, it, vi, beforeEach } from "vitest";
import { classifyTable } from "./import/tableClassifier";
import { normalizeClassifiedTables } from "./import/normalize";
import type { ParsedTable } from "./import/types";

const postExportPayload = vi.hoisted(() =>
    vi.fn(
        async (_url: string, _payload: unknown) =>
            ({ ok: true, updated: { Sprints: 1 } }) as { ok: boolean; error?: string; updated?: Record<string, number> }
    )
);

vi.mock("./import/sheetSource", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./import/sheetSource")>()),
    postExportPayload,
}));
vi.mock("./persistence/firestoreStore", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const stub: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(actual)) {
        stub[name] = typeof value === "function" ? vi.fn(async () => undefined) : value;
    }
    return stub;
});
vi.mock("./persistence/localStore", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./persistence/localStore")>()),
    saveImportCache: vi.fn(),
    loadImportCache: vi.fn(() => ({ importCache: null, importCacheTimestamp: null })),
}));

const { GameStore } = await import("./GameStore");

/** How Papa hands us the sheet: the repeats survive under suffixed names. */
const CSV_HEADERS = [
    "SprintId",
    "RoundNumber",
    "Quota",
    "RoundSettings",
    "RoundSettings_1",
    "RoundSettings_2",
];

/** How the Apps Script endpoint hands us the same sheet: one key, the repeats already lost. */
const JSON_HEADERS = ["SprintId", "RoundNumber", "Quota", "RoundSettings"];

function sprintTable(headers: string[], row: Record<string, string>, collapsed: boolean): ParsedTable {
    return { sourceName: "Sprints", headers, rows: [row], duplicateHeadersCollapsed: collapsed };
}

function makeStore() {
    const store = new GameStore();
    store.sources = { configUrl: "https://example.test/exec", translationsUrl: "" };
    return store;
}

beforeEach(() => {
    postExportPayload.mockClear();
    vi.stubEnv("VITE_SHEETS_EXPORT_TOKEN", "test-token");
});

describe("repeated columns from a source that collapses duplicates", () => {
    it("reads the whole pool from CSV and reports no loss", () => {
        const { data } = normalizeClassifiedTables([
            classifyTable(
                sprintTable(
                    CSV_HEADERS,
                    { SprintId: "s", RoundNumber: "1", Quota: "1", RoundSettings: "a", RoundSettings_1: "b", RoundSettings_2: "c" },
                    false
                )
            ),
        ]);

        expect(data.sprints[0].rounds[0].roundIds).toEqual(["a", "b", "c"]);
        expect(data.lossyRepeatedColumnTables).toEqual([]);
    });

    it("flags the table when a collapsing source leaves a single column", () => {
        const { data } = normalizeClassifiedTables([
            classifyTable(sprintTable(JSON_HEADERS, { SprintId: "s", RoundNumber: "1", Quota: "1", RoundSettings: "" }, true)),
        ]);

        expect(data.sprints[0].rounds[0].roundIds).toEqual([]);
        expect(data.lossyRepeatedColumnTables).toContain("Sprints");
    });

    it("does not flag a collapsing source that genuinely supplied every repeat", () => {
        const { data } = normalizeClassifiedTables([
            classifyTable(
                sprintTable(
                    CSV_HEADERS,
                    { SprintId: "s", RoundNumber: "1", Quota: "1", RoundSettings: "a", RoundSettings_1: "b", RoundSettings_2: "" },
                    true
                )
            ),
        ]);

        expect(data.lossyRepeatedColumnTables).toEqual([]);
    });
});

describe("exports refuse to write columns the import could not read", () => {
    it("blocks the sprint export, which would otherwise blank every RoundSettings slot", async () => {
        const store = makeStore();
        store.lossyRepeatedColumnTables = ["Sprints"];
        store.upsertSprint({ id: "main_sprint", rounds: [{ id: "r1", roundIds: [] }] });

        const result = await store.exportSprintChanges();

        expect(result.ok).toBe(false);
        expect(result.error).toContain("RoundSettings");
        expect(postExportPayload).not.toHaveBeenCalled();
    });

    it("blocks the round export when DeckBalls came through collapsed", async () => {
        const store = makeStore();
        store.lossyRepeatedColumnTables = ["RoundSettings"];

        const result = await store.exportRoundChanges();

        expect(result.ok).toBe(false);
        expect(result.error).toContain("DeckBalls");
        expect(postExportPayload).not.toHaveBeenCalled();
    });

    it("blocks the deck export only when it would actually write a ball group", async () => {
        const store = makeStore();
        store.lossyRepeatedColumnTables = ["BallGroups"];

        // Nothing to write for ball groups — a plain deck edit must still go through.
        store.upsertDeck({ id: "d1", source: "Decks", entries: [] });
        expect((await store.exportDeckChanges()).ok).toBe(true);

        store.upsertBallGroup({ id: "g1", ballIds: ["b1"] });
        const blocked = await store.exportDeckChanges();
        expect(blocked.ok).toBe(false);
        expect(blocked.error).toContain("Ball");
    });

    it("lets the sprint export through once the source supplies the repeats", async () => {
        const store = makeStore();
        store.lossyRepeatedColumnTables = [];
        store.upsertSprint({ id: "main_sprint", rounds: [{ id: "r1", roundIds: ["a", "b"] }] });

        const result = await store.exportSprintChanges();

        expect(result.ok).toBe(true);
        const payload = postExportPayload.mock.calls.at(-1)?.[1] as {
            sprints: Record<string, { repeatedValues: string[] }[]>;
        };
        expect(payload.sprints.main_sprint[0].repeatedValues).toEqual(["a", "b"]);
    });
});
