import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ParsedTable } from "./import/types";

const fetchSourceTables = vi.hoisted(() => vi.fn(async (_url: string, _label: string) => [] as ParsedTable[]));
const replaceTranslationOverridesRemote = vi.hoisted(() => vi.fn(async (_o: Record<string, string>) => undefined));

vi.mock("./import/sheetSource", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./import/sheetSource")>()),
    fetchSourceTables,
}));

// Every Firestore writer is stubbed out wholesale: this repo's Firebase config points at the real shared
// project, so a test that reached even one live setDoc would be writing to production data.
vi.mock("./persistence/firestoreStore", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const stub: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(actual)) {
        stub[name] = typeof value === "function" ? vi.fn(async () => undefined) : value;
    }
    stub.replaceTranslationOverridesRemote = replaceTranslationOverridesRemote;
    return stub;
});

// localStorage doesn't exist under vitest's default node environment.
vi.mock("./persistence/localStore", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./persistence/localStore")>()),
    saveImportCache: vi.fn(),
    loadImportCache: vi.fn(() => ({ importCache: null, importCacheTimestamp: null })),
}));

const { GameStore } = await import("./GameStore");

/** A real item_desc tab, already cleaned up in the sheet — the sentence the user deleted is gone. */
function itemDescTable(rows: { key: string; ru: string }[]): ParsedTable {
    return { sourceName: "item_desc", headers: ["key", "ru"], rows: rows as unknown as Record<string, string>[] };
}

const CLEANED = "Активирует здание рядом {ActivationCount} раз";
const STALE = "Дает ${MoneyValue}. Активирует здание рядом {ActivationCount} раз";

beforeEach(() => {
    fetchSourceTables.mockClear();
    replaceTranslationOverridesRemote.mockClear();
});

describe("translation overrides vs. a fresh sheet download", () => {
    it("stops an already-exported override from shadowing the sheet forever", async () => {
        const store = new GameStore();
        // The override was pushed to the sheet earlier, so exportedOverrides matches it exactly...
        store.translationOverrides = { c_x_desc: STALE };
        store.exportedOverrides = { c_x_desc: STALE };
        // ...and the sheet has since been edited by hand to drop the sentence.
        fetchSourceTables.mockResolvedValueOnce([itemDescTable([{ key: "c_x_desc", ru: CLEANED }])]);

        await store.importTranslations("https://example.test/exec");

        expect(store.translationOverrides).not.toHaveProperty("c_x_desc");
        expect(store.getTranslation("c_x_desc")).toBe(CLEANED);
        // Retired in Firestore too, or it would come straight back on the next page load.
        expect(replaceTranslationOverridesRemote).toHaveBeenCalledWith({});
    });

    it("keeps a local edit that was never exported", async () => {
        const store = new GameStore();
        store.translationOverrides = { c_x_desc: "черновик, ещё не выгружен" };
        store.exportedOverrides = {}; // never sent
        fetchSourceTables.mockResolvedValueOnce([itemDescTable([{ key: "c_x_desc", ru: CLEANED }])]);

        await store.importTranslations("https://example.test/exec");

        expect(store.getTranslation("c_x_desc")).toBe("черновик, ещё не выгружен");
        expect(replaceTranslationOverridesRemote).not.toHaveBeenCalled();
    });

    it("keeps an override whose key the download didn't include", async () => {
        const store = new GameStore();
        store.translationOverrides = { c_missing_desc: STALE };
        store.exportedOverrides = { c_missing_desc: STALE };
        // Dropping it would lose text that exists nowhere else.
        fetchSourceTables.mockResolvedValueOnce([itemDescTable([{ key: "c_other_desc", ru: CLEANED }])]);

        await store.importTranslations("https://example.test/exec");

        expect(store.getTranslation("c_missing_desc")).toBe(STALE);
        expect(replaceTranslationOverridesRemote).not.toHaveBeenCalled();
    });

    it("retires only the superseded entries when both kinds are present", async () => {
        const store = new GameStore();
        store.translationOverrides = { c_sent_desc: STALE, c_draft_desc: "черновик" };
        store.exportedOverrides = { c_sent_desc: STALE };
        fetchSourceTables.mockResolvedValueOnce([
            itemDescTable([
                { key: "c_sent_desc", ru: CLEANED },
                { key: "c_draft_desc", ru: "текст из таблицы" },
            ]),
        ]);

        await store.importTranslations("https://example.test/exec");

        expect(store.getTranslation("c_sent_desc")).toBe(CLEANED);
        expect(store.getTranslation("c_draft_desc")).toBe("черновик");
        expect(replaceTranslationOverridesRemote).toHaveBeenCalledWith({ c_draft_desc: "черновик" });
        // The unsent draft still counts as pending export; the retired one no longer does.
        expect(store.pendingExportCount).toBe(1);
    });
});
