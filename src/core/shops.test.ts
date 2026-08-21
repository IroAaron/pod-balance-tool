import { describe, expect, it, vi, beforeEach } from "vitest";
import { classifyTable } from "./import/tableClassifier";
import { normalizeClassifiedTables } from "./import/normalize";
import type { ParsedTable } from "./import/types";

// The default answer mimics a current Apps Script: ok, and reporting the sheet it touched. Tests that care
// about a stale deployment override it per-call.
const postExportPayload = vi.hoisted(() =>
    vi.fn(
        async (_url: string, _payload: unknown) =>
            ({ ok: true, updated: { ShopSettings: 1 } }) as {
                ok: boolean;
                error?: string;
                updated?: Record<string, number>;
            }
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

const HEADERS = ["ShopId", "HousesInShop", "PacksInShop", "PacksWeights"];

function table(rows: Record<string, string>[], sourceName = "ShopSettings"): ParsedTable {
    return { sourceName, headers: HEADERS, rows };
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

describe("importing ShopSettings", () => {
    it("is recognised by its ShopId column", () => {
        expect(classifyTable(table([])).type).toBe("ShopSettings");
    });

    it("groups rows by ShopId and keeps the two id columns as separate lists", () => {
        const { data } = normalizeClassifiedTables([
            classifyTable(
                table([
                    { ShopId: "shop_1", HousesInShop: "houses_common", PacksInShop: "pack_a", PacksWeights: "10" },
                    { ShopId: "shop_1", HousesInShop: "houses_rare", PacksInShop: "pack_b", PacksWeights: "5" },
                    // More card packs than house packs — the extra rows leave HousesInShop blank.
                    { ShopId: "shop_1", HousesInShop: "", PacksInShop: "pack_c", PacksWeights: "" },
                    { ShopId: "shop_2", HousesInShop: "houses_common", PacksInShop: "", PacksWeights: "" },
                ])
            ),
        ]);

        expect(data.shops).toHaveLength(2);
        const [first, second] = data.shops;
        expect(first.id).toBe("shop_1");
        expect(first.housePacks.map((entry) => entry.packId)).toEqual(["houses_common", "houses_rare"]);
        expect(first.cardPacks.map((entry) => `${entry.packId}:${entry.weight ?? "-"}`)).toEqual([
            "pack_a:10",
            "pack_b:5",
            "pack_c:-",
        ]);
        expect(second.housePacks.map((entry) => entry.packId)).toEqual(["houses_common"]);
        expect(second.cardPacks).toEqual([]);
    });

    it("ignores rows with no ShopId rather than inventing a blank shop", () => {
        const { data } = normalizeClassifiedTables([
            classifyTable(table([{ ShopId: "", HousesInShop: "x", PacksInShop: "y", PacksWeights: "1" }])),
        ]);
        expect(data.shops).toEqual([]);
    });
});

describe("exporting shops", () => {
    it("writes the longer of the two lists as the row count, filling each column by index", async () => {
        const store = makeStore();
        store.upsertShop({
            id: "shop_1",
            housePacks: [{ id: "h1", packId: "houses_common" }],
            cardPacks: [
                { id: "p1", packId: "pack_a", weight: 10 },
                { id: "p2", packId: "pack_b", weight: 5 },
            ],
        });

        await store.exportShopChanges();

        const payload = postExportPayload.mock.calls.at(-1)?.[1] as {
            shops: Record<string, Record<string, string>[]>;
        };
        expect(payload.shops.shop_1).toEqual([
            { HousesInShop: "houses_common", PacksInShop: "pack_a", PacksWeights: "10" },
            { HousesInShop: "", PacksInShop: "pack_b", PacksWeights: "5" },
        ]);
    });

    it("drops a slot that has no pack picked yet", async () => {
        const store = makeStore();
        store.upsertShop({
            id: "shop_1",
            housePacks: [{ id: "h1", packId: "" }],
            cardPacks: [{ id: "p1", packId: "pack_a" }],
        });

        await store.exportShopChanges();

        const payload = postExportPayload.mock.calls.at(-1)?.[1] as {
            shops: Record<string, Record<string, string>[]>;
        };
        expect(payload.shops.shop_1).toEqual([{ HousesInShop: "", PacksInShop: "pack_a", PacksWeights: "" }]);
    });

    it("sends an empty row set for a deleted shop, which clears its rows", async () => {
        const store = makeStore();
        store.upsertShop({ id: "shop_1", housePacks: [], cardPacks: [] });
        await store.exportShopChanges();
        store.deleteShop("shop_1");

        await store.exportShopChanges();

        const payload = postExportPayload.mock.calls.at(-1)?.[1] as {
            shops: Record<string, Record<string, string>[]>;
        };
        expect(payload.shops).toEqual({ shop_1: [] });
    });

    it("clears the pending count only once the send succeeds", async () => {
        const store = makeStore();
        store.upsertShop({ id: "shop_1", housePacks: [], cardPacks: [] });
        expect(store.shopPendingExportCount).toBe(1);

        postExportPayload.mockResolvedValueOnce({ ok: false, error: "нет связи" });
        await store.exportShopChanges();
        expect(store.shopPendingExportCount).toBe(1);

        await store.exportShopChanges();
        expect(store.shopPendingExportCount).toBe(0);
    });

    it("treats a stale Apps Script — ok, but no ShopSettings in `updated` — as a failure", async () => {
        const store = makeStore();
        store.upsertShop({ id: "shop_1", housePacks: [{ id: "h", packId: "houses_common" }], cardPacks: [] });

        // What a deployment predating the `shops` branch answers: it ignores the key and reports success.
        postExportPayload.mockResolvedValueOnce({ ok: true, updated: { item_name: 0 } } as never);
        const result = await store.exportShopChanges();

        expect(result.ok).toBe(false);
        expect(result.error).toContain("ShopSettings");
        // Crucially the edits are still pending, not silently dropped.
        expect(store.shopPendingExportCount).toBe(1);
    });

    it("accepts a run that reports ShopSettings, even when it wrote zero rows", async () => {
        const store = makeStore();
        store.upsertShop({ id: "shop_1", housePacks: [], cardPacks: [] });

        postExportPayload.mockResolvedValueOnce({ ok: true, updated: { ShopSettings: 0 } } as never);
        const result = await store.exportShopChanges();

        expect(result.ok).toBe(true);
        expect(store.shopPendingExportCount).toBe(0);
    });

    it("refuses to create a shop whose id is already taken", () => {
        const store = makeStore();
        store.createShop("shop_1");
        store.upsertShop({ id: "shop_1", housePacks: [{ id: "h", packId: "houses_common" }], cardPacks: [] });
        store.createShop("shop_1");

        expect(store.shops).toHaveLength(1);
        expect(store.getShop("shop_1")?.housePacks).toHaveLength(1);
    });
});
