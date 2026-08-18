import { describe, expect, it, vi } from "vitest";
import { PLACEHOLDER_ITEM_ICON } from "./domain/sprites";

const updateItemIconRemote = vi.hoisted(() => vi.fn(async (_id: string, _icon: string) => undefined));

vi.mock("./persistence/firestoreStore", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const stub: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(actual)) {
        stub[name] = typeof value === "function" ? vi.fn(async () => undefined) : value;
    }
    stub.updateItemIconRemote = updateItemIconRemote;
    return stub;
});
vi.mock("./persistence/localStore", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./persistence/localStore")>()),
    saveImportCache: vi.fn(),
    loadImportCache: vi.fn(() => ({ importCache: null, importCacheTimestamp: null })),
}));

const { GameStore } = await import("./GameStore");

describe("manual item icons vs. the item's own sprite", () => {
    it("clears rather than stores the placeholder, which would hide the sprite", () => {
        const store = new GameStore();

        store.setItemIcon("c_chel_plus_for_stop_his_position_1", PLACEHOLDER_ITEM_ICON);

        expect(store.getItemIcon("c_chel_plus_for_stop_his_position_1")).toBeUndefined();
        expect(store.itemIcons).not.toHaveProperty("c_chel_plus_for_stop_his_position_1");
        // "" is the remote's delete-the-field convention, so it doesn't linger in Firestore either.
        expect(updateItemIconRemote).toHaveBeenCalledWith("c_chel_plus_for_stop_his_position_1", "");
    });

    it("clears on an empty value too", () => {
        const store = new GameStore();
        store.setItemIcon("c_x", "🔥");
        expect(store.getItemIcon("c_x")).toBe("🔥");

        store.setItemIcon("c_x", "");
        expect(store.getItemIcon("c_x")).toBeUndefined();
    });

    it("still stores a real emoji", () => {
        const store = new GameStore();
        store.setItemIcon("c_x", "💰");
        expect(store.getItemIcon("c_x")).toBe("💰");
        expect(store.itemIcons.c_x).toBe("💰");
    });
});
