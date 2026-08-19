import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MechanicRow } from "./models/Mechanic";

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

const TIERS = ["c_thief_1", "c_thief_2", "c_thief_3"];

function makeStore() {
    const store = new GameStore();
    store.upsertItem(TIERS[0], "Card", { tags: ["Criminal"], raw: { ValueMin: "1", Cost: "3", Overheat: "5" } });
    store.upsertItem(TIERS[1], "Card", { tags: [], raw: { ValueMin: "5", Cost: "9", Overheat: "" } });
    store.upsertItem(TIERS[2], "Card", { tags: [], raw: { ValueMin: "9", Cost: "12", Overheat: "" } });
    store.upgradeChains = [{ id: "up_thief", itemIds: [...TIERS] }];
    store.sources = { configUrl: "https://example.test/exec", translationsUrl: "" };
    store.dirtyItemIds.clear();
    return store;
}

const lastPayload = () =>
    postExportPayload.mock.calls.at(-1)?.[1] as {
        upgradeChains?: Record<string, Record<string, string>>;
        replaceRules?: Record<string, Record<string, Record<string, string>[]>>;
    };

beforeEach(() => {
    postExportPayload.mockClear();
    vi.stubEnv("VITE_SHEETS_EXPORT_TOKEN", "test-token");
});

describe("copying a section onto upgrade tiers", () => {
    it("copies params to later tiers including the balance numbers, as chosen", () => {
        const store = makeStore();

        expect(store.copyParamsToUpgrades(TIERS[0])).toEqual({ tiers: 2 });

        // Confirmed behaviour: the tiers' own ValueMin/Cost are deliberately overwritten.
        expect(store.getItem(TIERS[1])?.raw).toMatchObject({ ValueMin: "1", Cost: "3", Overheat: "5" });
        expect(store.getItem(TIERS[2])?.raw).toMatchObject({ ValueMin: "1", Cost: "3" });
        // The tier keeps its own id rather than inheriting the source's.
        expect(store.getItem(TIERS[1])?.id).toBe(TIERS[1]);
        expect(store.getItem(TIERS[1])?.raw.ItemId).toBe(TIERS[1]);
    });

    it("copies tags without disturbing the tiers' other columns", () => {
        const store = makeStore();

        store.copyTagsToUpgrades(TIERS[0]);

        expect(store.getItem(TIERS[1])?.tags).toEqual(["Criminal"]);
        expect(store.getItem(TIERS[1])?.raw.ValueMin).toBe("5");
    });

    it("only reaches tiers after the source, never earlier ones", () => {
        const store = makeStore();
        store.copyParamsToUpgrades(TIERS[1]);

        expect(store.getItem(TIERS[0])?.raw.ValueMin).toBe("1");
        expect(store.getItem(TIERS[2])?.raw.ValueMin).toBe("5");
    });
});

describe("upgrade chain editing", () => {
    it("unlinks a tier without deleting the item itself", () => {
        const store = makeStore();

        store.removeItemFromChain("up_thief", TIERS[1]);

        expect(store.chainForItem(TIERS[0])?.itemIds).toEqual([TIERS[0], TIERS[2]]);
        expect(store.getItem(TIERS[1])).toBeDefined();
    });

    it("generates the next tier as a copy, named with one more +", () => {
        const store = makeStore();
        store.setTranslationOverride("c_thief_3", "Вор++");
        store.mechanics = [
            { id: "MechAddValue:c_thief_1:0", table: "MechAddValue", itemId: TIERS[0], fields: { ActivatorType: "BallStop" } },
        ];

        const newId = store.createNextTier(TIERS[0]);

        expect(newId).toBe("c_thief_4");
        expect(store.itemName(store.getItem("c_thief_4")!)).toBe("Вор+++");
        expect(store.getItem("c_thief_4")?.raw).toMatchObject({ ValueMin: "1", Cost: "3" });
        expect(store.getItem("c_thief_4")?.tags).toEqual(["Criminal"]);
        // The source's mechanics come along, retargeted at the new item.
        expect(store.mechanics.filter((row) => row.itemId === "c_thief_4")).toHaveLength(1);
        expect(store.chainForItem("c_thief_4")?.itemIds).toEqual([...TIERS, "c_thief_4"]);
    });

    it("skips ids already taken instead of colliding", () => {
        const store = makeStore();
        store.upsertItem("c_thief_4", "Card", {});

        expect(store.createNextTier(TIERS[0])).toBe("c_thief_5");
    });

    it("starts a chain for an item that isn't in one yet", () => {
        const store = makeStore();
        store.upsertItem("c_loner", "Card", {});

        const newId = store.createNextTier("c_loner");

        expect(newId).toBe("c_loner_2");
        expect(store.chainForItem("c_loner")?.itemIds).toEqual(["c_loner", "c_loner_2"]);
    });

    it("exports the chain with blanks for cleared tier columns", async () => {
        const store = makeStore();
        store.removeItemFromChain("up_thief", TIERS[2]);

        await store.exportContentChanges();

        expect(lastPayload().upgradeChains?.up_thief).toEqual({
            UpgradeId1: TIERS[0],
            UpgradeId2: TIERS[1],
            UpgradeId3: "",
        });
    });
});

describe("replace rules", () => {
    const rule = {
        id: "ReplaceItem:c_thief_1:0",
        source: "ReplaceItem" as const,
        itemIdToReplace: TIERS[0],
        replacementItem: "c_rock_star",
        fields: { NeededItem: "c_producer", NeededItemNumber: "1" },
    };

    it("exports a source item's rules as one replaceable group", async () => {
        const store = makeStore();
        store.upsertReplaceRule(rule);

        await store.exportContentChanges();

        expect(lastPayload().replaceRules?.ReplaceItem?.[TIERS[0]]).toEqual([
            { ItemIdToReplace: TIERS[0], ReplacementItem: "c_rock_star", NeededItem: "c_producer", NeededItemNumber: "1" },
        ]);
    });

    it("sends an empty group after a delete, which is what removes the row from the sheet", async () => {
        const store = makeStore();
        store.upsertReplaceRule(rule);
        store.deleteReplaceRule(rule.id);

        expect(store.replaceRules).toHaveLength(0);
        await store.exportContentChanges();

        expect(lastPayload().replaceRules?.ReplaceItem?.[TIERS[0]]).toEqual([]);
    });

    it("counts chain and replace edits as pending, and clears them after a successful export", async () => {
        const store = makeStore();
        store.removeItemFromChain("up_thief", TIERS[2]);
        store.upsertReplaceRule(rule);

        expect(store.contentPendingExportCount).toBe(2);
        await store.exportContentChanges();
        expect(store.contentPendingExportCount).toBe(0);
    });
});

describe("mechanic rows created for a generated tier", () => {
    it("are appended, not treated as edits to an existing sheet row", () => {
        const store = makeStore();
        const row: MechanicRow = {
            id: "MechAddValue:c_thief_1:0",
            table: "MechAddValue",
            itemId: TIERS[0],
            fields: { ActivatorType: "BallStop" },
        };
        store.mechanics = [row];

        const newId = store.createNextTier(TIERS[0])!;

        const created = store.mechanics.find((entry) => entry.itemId === newId)!;
        expect(store.newMechanicRowIds.has(created.id)).toBe(true);
        expect(store.editedMechanicRowIds.has(created.id)).toBe(false);
    });
});
