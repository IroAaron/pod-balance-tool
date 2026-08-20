import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyIdRules } from "./domain/idRules";

const postExportPayload = vi.hoisted(() =>
    vi.fn(async (_url: string, _payload: unknown) => ({ ok: true }) as { ok: boolean; error?: string })
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
const { normalizeClassifiedTables } = await import("./import/normalize");

/** Feeds items through the same path a real config download takes, so the import-time bookkeeping runs. */
function importItems(store: InstanceType<typeof GameStore>, items: { id: string; itemType: string }[]) {
    const { data } = normalizeClassifiedTables([]);
    const result = {
        data: { ...data, items: items.map((i) => ({ ...i, tags: [], raw: { ItemId: i.id } })) },
        report: { tables: [], warnings: [] },
    };
    (store as unknown as { applyImportResult: (r: unknown, o?: unknown) => void }).applyImportResult(result, {
        scope: "config",
    });
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

describe("id rules on creation", () => {
    it("appends _1 to a Card id that doesn't end in a tier number", () => {
        expect(applyIdRules("c_chel_money", "Card", true).id).toBe("c_chel_money_1");
    });

    it("leaves a Card id that already ends in _<number> alone", () => {
        expect(applyIdRules("c_chel_money_2", "Card", true).id).toBe("c_chel_money_2");
        expect(applyIdRules("c_chel_money_2", "Card", true).applied).toEqual([]);
    });

    it("only applies to Cards — Houses and Artefacts aren't tiered the same way", () => {
        expect(applyIdRules("h_bank", "House", true).id).toBe("h_bank");
        expect(applyIdRules("a_pocket", "Artefact", true).id).toBe("a_pocket");
    });

    it("does nothing at all when the setting is off", () => {
        expect(applyIdRules("c_chel_money", "Card", false).id).toBe("c_chel_money");
    });

    it("reports which rules fired, so the UI can explain the change", () => {
        expect(applyIdRules("c_chel_money", "Card", true).applied).toHaveLength(1);
    });
});

describe("exporting an edited sheet-backed item", () => {
    it("sends only the columns that changed, not the whole row", async () => {
        const store = makeStore();
        importItems(store, [{ id: "c_real", itemType: "Card" }]);
        // As it arrived from the sheet.
        store.allItems = [
            {
                id: "c_real",
                itemType: "Card",
                tags: [],
                raw: { ItemId: "c_real", Weight: "2", CardSpriteName: "card_track_richman", Rarity: "" },
            },
        ];
        store.upsertItem("c_real", "Card", { raw: { Rarity: "Rare" } });

        await store.exportContentChanges();

        const payload = postExportPayload.mock.calls.at(-1)?.[1] as {
            items: Record<string, Record<string, Record<string, string>>>;
        };
        // CardSpriteName is untouched, so it must not be rewritten — the sheet validates that column, and
        // re-writing a value it no longer accepts aborts the export.
        expect(payload.items.Cards.c_real).toEqual({ ItemId: "c_real", Rarity: "Rare" });
    });

    it("still sends every column for an item created on the site", async () => {
        const store = makeStore();
        store.upsertItem("c_new_1", "Card", { raw: { Weight: "2" } });

        await store.exportContentChanges();

        const payload = postExportPayload.mock.calls.at(-1)?.[1] as {
            items: Record<string, Record<string, Record<string, string>>>;
        };
        expect(payload.items.Cards.c_new_1).toEqual({ ItemId: "c_new_1", Weight: "2" });
    });
});

describe("renaming an item that was never exported", () => {
    it("is allowed for a site-created item and refused once it's been exported", async () => {
        const store = makeStore();
        store.upsertItem("c_draft", "Card", {});
        expect(store.canRenameItem("c_draft")).toBe(true);

        await store.exportContentChanges();

        expect(store.canRenameItem("c_draft")).toBe(false);
        expect(store.renameItem("c_draft", "c_other")).toEqual({
            ok: false,
            error: "Предмет уже выгружен в таблицу — id менять нельзя",
        });
    });

    it("is refused for an item that came from the sheet", () => {
        const store = makeStore();
        // Imported items land in allItems directly, never through upsertItem.
        store.allItems = [{ id: "c_real", itemType: "Card", tags: [], raw: { ItemId: "c_real" } }];

        expect(store.canRenameItem("c_real")).toBe(false);
    });

    it("refuses an empty or already-taken id", () => {
        const store = makeStore();
        store.upsertItem("c_draft", "Card", {});
        store.upsertItem("c_taken", "Card", {});

        expect(store.renameItem("c_draft", "  ").ok).toBe(false);
        expect(store.renameItem("c_draft", "c_taken")).toEqual({ ok: false, error: "Такой id уже есть" });
    });

    it("carries the item, its keys and its name across", () => {
        const store = makeStore();
        store.upsertItem("c_draft", "Card", { tags: ["Rich"], raw: { Cost: "5" } });
        store.setTranslationOverride("c_draft", "Черновик");
        store.setTranslationOverride("c_draft_desc", "Описание");

        expect(store.renameItem("c_draft", "c_final_1").ok).toBe(true);

        const renamed = store.getItem("c_final_1")!;
        expect(store.getItem("c_draft")).toBeUndefined();
        expect(renamed.raw).toMatchObject({ ItemId: "c_final_1", Cost: "5" });
        expect(renamed.tags).toEqual(["Rich"]);
        expect(store.itemName(renamed)).toBe("Черновик");
        expect(store.itemDescription(renamed)).toBe("Описание");
        // The old keys must not linger, or they'd be exported as a phantom row.
        expect(store.translationOverrides).not.toHaveProperty("c_draft");
        expect(store.translationOverrides).not.toHaveProperty("c_draft_desc");
    });

    it("moves every reference: mechanics, chain, replace rules, and id-valued fields", () => {
        const store = makeStore();
        store.upsertItem("c_draft", "Card", {});
        store.upsertItem("c_other", "Card", {});
        store.addMechanicRow("c_draft", "MechAddValue");
        store.upsertMechanicRow({
            id: "content:new:MechActivate:c_other:9",
            table: "MechActivate",
            itemId: "c_other",
            // Another item pointing at the one being renamed.
            fields: { UseTargetIds: "c_draft" },
        });
        store.setUpgradeChain("up_draft", ["c_draft", "c_other"]);
        store.upsertReplaceRule({
            id: "r1",
            source: "ReplaceItem",
            itemIdToReplace: "c_draft",
            replacementItem: "c_other",
            fields: {},
        });

        expect(store.renameItem("c_draft", "c_final_1").ok).toBe(true);

        expect(store.mechanics.filter((row) => row.itemId === "c_final_1")).toHaveLength(1);
        expect(store.mechanics.find((row) => row.itemId === "c_other")?.fields.UseTargetIds).toBe("c_final_1");
        expect(store.chainForItem("c_final_1")?.itemIds).toEqual(["c_final_1", "c_other"]);
        expect(store.replaceRules[0].itemIdToReplace).toBe("c_final_1");
        // Still renameable, and still queued for export under the new id.
        expect(store.canRenameItem("c_final_1")).toBe(true);
        expect(store.dirtyItemIds.has("c_final_1")).toBe(true);
        expect(store.dirtyItemIds.has("c_draft")).toBe(false);
    });

    it("stops being renameable once an import brings the same id back from the sheet", () => {
        const store = makeStore();
        store.upsertItem("c_draft", "Card", {});
        expect(store.canRenameItem("c_draft")).toBe(true);

        // Someone else added the row upstream and the config was re-downloaded: the sheet owns this id now.
        importItems(store, [{ id: "c_draft", itemType: "Card" }]);

        expect(store.canRenameItem("c_draft")).toBe(false);
    });

    it("exports the renamed item under its new id only", async () => {
        const store = makeStore();
        store.upsertItem("c_draft", "Card", {});
        store.renameItem("c_draft", "c_final_1");

        await store.exportContentChanges();

        const payload = postExportPayload.mock.calls.at(-1)?.[1] as {
            items: Record<string, Record<string, unknown>>;
        };
        expect(Object.keys(payload.items.Cards)).toEqual(["c_final_1"]);
    });
});
