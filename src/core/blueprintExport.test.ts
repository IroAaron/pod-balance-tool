import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MechanicRow } from "./models/Mechanic";
import type { Item } from "./models/Item";

const postExportPayload = vi.hoisted(() =>
    vi.fn(async (_url: string, _payload: unknown) => ({ ok: true }) as { ok: boolean; error?: string })
);

interface SentUpdate {
    itemId: string;
    ordinal: number;
    fields: Record<string, string>;
    originalFields: Record<string, string>;
}

/** The `updatedMechanicRows` block of whatever was POSTed on the most recent export. */
function sentUpdates(table: string): SentUpdate[] {
    const payload = postExportPayload.mock.calls.at(-1)?.[1] as {
        updatedMechanicRows?: Record<string, SentUpdate[]>;
    };
    return payload?.updatedMechanicRows?.[table] ?? [];
}

// Only the Sheets POST is faked — everything under test (dirty tracking, ordinal computation, payload shape)
// is the real implementation. Firestore needs no stub: none of the methods exercised here touch it, and the
// SDK opens no connection at import time.
vi.mock("./import/sheetSource", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./import/sheetSource")>()),
    postExportPayload,
}));

const { GameStore } = await import("./GameStore");

/** Real "Секретная лаборатория" — one MechAddItem row, Activator = BallPass on a Road tile nearby. */
const LAB_ID = "h_replace_chel_near_into_crazy_for_ball_pass";

function labMechanicRow(): MechanicRow {
    return {
        id: `MechAddItem:${LAB_ID}:0`,
        table: "MechAddItem",
        itemId: LAB_ID,
        fields: {
            ActivatorType: "BallPass",
            ActivatorTargetType: "Road",
            ActivatorPlace: "Near",
            TargetType: "Road",
            TargetPlace: "Near",
            TargetCount: "1",
            ItemMech: "поставить",
            NewItemId: "c_chel_recolor_self_1",
        },
    };
}

function labItem(): Item {
    return { id: LAB_ID, itemType: "House", tags: [], raw: { ItemId: LAB_ID } };
}

function makeStore() {
    const store = new GameStore();
    store.allItems = [labItem()];
    store.mechanics = [labMechanicRow()];
    store.sources = { configUrl: "https://example.test/exec", translationsUrl: "" };
    return store;
}

beforeEach(() => {
    postExportPayload.mockClear();
    vi.stubEnv("VITE_SHEETS_EXPORT_TOKEN", "test-token");
});

describe("Blueprint Lab export of edits to an existing mechanic row", () => {
    it("counts an edit to an existing row as pending, and sends it as an in-place update", async () => {
        const store = makeStore();
        const rowId = `MechAddItem:${LAB_ID}:0`;

        expect(store.blueprintPendingExportCount).toBe(0);

        store.updateMechanicRowFields(rowId, { ActivatorType: "BallStop" });
        expect(store.blueprintPendingExportCount).toBe(1);

        await store.exportBlueprintChanges();

        const [update] = sentUpdates("MechAddItem");

        expect(update.itemId).toBe(LAB_ID);
        expect(update.ordinal).toBe(0);
        expect(update.fields.ActivatorType).toBe("BallStop");
        // The guard carries the value as imported, so the receiver can prove it found the right row.
        expect(update.originalFields.ActivatorType).toBe("BallPass");
        // Untouched fields ride along unchanged rather than being dropped.
        expect(update.fields.NewItemId).toBe("c_chel_recolor_self_1");
    });

    it("sends blanks for cleared fields so they actually clear in the sheet", async () => {
        const store = makeStore();
        store.updateMechanicRowFields(`MechAddItem:${LAB_ID}:0`, { ActivatorPlace: "" });

        await store.exportBlueprintChanges();
        const [update] = sentUpdates("MechAddItem");

        expect(update.fields.ActivatorPlace).toBe("");
        // A column the row never had is still present (blank), not omitted — that's what makes clearing work.
        expect(update.fields).toHaveProperty("ActivatorTag", "");
    });

    it("addresses the right row when one item has several rows in the same table", async () => {
        const store = makeStore();
        const second: MechanicRow = { ...labMechanicRow(), id: `MechAddItem:${LAB_ID}:1`, fields: { ActivatorType: "BallStart" } };
        // An unrelated item's row sits between them, exactly as it might in the real sheet.
        const other: MechanicRow = { id: "MechAddItem:other:0", table: "MechAddItem", itemId: "other", fields: {} };
        store.mechanics = [labMechanicRow(), other, second];

        store.updateMechanicRowFields(`MechAddItem:${LAB_ID}:1`, { ActivatorType: "LoopCompleted" });
        await store.exportBlueprintChanges();

        const [update] = sentUpdates("MechAddItem");

        // Ordinal counts only this item's rows, so the interleaved foreign row must not shift it.
        expect(update.ordinal).toBe(1);
        expect(update.fields.ActivatorType).toBe("LoopCompleted");
    });

    it("ignores a no-op write, so untouched rows are never re-sent", async () => {
        const store = makeStore();
        store.updateMechanicRowFields(`MechAddItem:${LAB_ID}:0`, { ActivatorType: "BallPass" });
        expect(store.blueprintPendingExportCount).toBe(0);
    });

    it("clears pending state only after a successful export", async () => {
        const store = makeStore();
        store.updateMechanicRowFields(`MechAddItem:${LAB_ID}:0`, { ActivatorType: "BallStop" });

        postExportPayload.mockResolvedValueOnce({ ok: false as const } as never);
        await store.exportBlueprintChanges();
        expect(store.blueprintPendingExportCount).toBe(1);

        await store.exportBlueprintChanges();
        expect(store.blueprintPendingExportCount).toBe(0);
    });
});
