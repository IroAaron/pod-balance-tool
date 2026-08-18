import { describe, expect, it, vi } from "vitest";
import type { MechanicRow } from "./models/Mechanic";

// Firestore writers stubbed wholesale — this repo's Firebase config points at the real shared project.
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

const TIERS = ["c_chel_activate_near_house_1", "c_chel_activate_near_house_2", "c_chel_activate_near_house_3"];

function activateRow(itemId: string, ordinal: number, fields: Record<string, string>): MechanicRow {
    return { id: `MechActivate:${itemId}:${ordinal}`, table: "MechActivate", itemId, fields };
}

/**
 * Items go in through upsertItem rather than by assigning `allItems`: the store keeps a by-id lookup that only
 * the real write paths refresh, and getItem() (which this feature uses to skip tiers that don't exist) reads it.
 * Seeding isn't a user edit, so the dirty set is cleared afterwards to keep the export assertions meaningful.
 */
function makeStore(mechanics: MechanicRow[], raws: Record<string, Record<string, string>> = {}) {
    const store = new GameStore();
    for (const id of TIERS) store.upsertItem(id, "Card", { raw: raws[id] });
    store.blueprintDirtyItemIds.clear();
    store.upgradeChains = [{ id: "up_near_house", itemIds: TIERS }];
    store.mechanics = mechanics;
    return store;
}

const rowOf = (store: InstanceType<typeof GameStore>, itemId: string) =>
    store.mechanics.find((row) => row.itemId === itemId);

describe("copyMechanicsToUpgrades", () => {
    it("copies structure forward onto later tiers only", () => {
        const store = makeStore([
            activateRow(TIERS[0], 0, { ActivatorType: "BallStop", ActivatorPlace: "Near", TargetType: "House" }),
            activateRow(TIERS[1], 0, { ActivatorType: "BallPass", ActivatorPlace: "Near", TargetType: "House" }),
            activateRow(TIERS[2], 0, { ActivatorType: "BallPass", ActivatorPlace: "Near", TargetType: "House" }),
        ]);

        const result = store.copyMechanicsToUpgrades(TIERS[0]);

        expect(result).toEqual({ tiers: 2, updated: 2, added: 0 });
        expect(rowOf(store, TIERS[1])?.fields.ActivatorType).toBe("BallStop");
        expect(rowOf(store, TIERS[2])?.fields.ActivatorType).toBe("BallStop");
    });

    it("keeps a tier's own scaling counters instead of flattening the upgrade", () => {
        // Real shape: this chain scales ActivationCount 1 → 2 → 3 while everything else stays identical.
        const store = makeStore([
            activateRow(TIERS[0], 0, { ActivatorType: "BallStop", ActivationCount: "1" }),
            activateRow(TIERS[1], 0, { ActivatorType: "BallPass", ActivationCount: "2" }),
            activateRow(TIERS[2], 0, { ActivatorType: "BallPass", ActivationCount: "3" }),
        ]);

        store.copyMechanicsToUpgrades(TIERS[0]);

        expect(rowOf(store, TIERS[1])?.fields).toMatchObject({ ActivatorType: "BallStop", ActivationCount: "2" });
        expect(rowOf(store, TIERS[2])?.fields).toMatchObject({ ActivatorType: "BallStop", ActivationCount: "3" });
    });

    it("clears a filter the source no longer has, rather than merging into the tier", () => {
        const store = makeStore([
            activateRow(TIERS[0], 0, { ActivatorType: "BallStop" }),
            activateRow(TIERS[1], 0, { ActivatorType: "BallStop", ActivatorTag: "Rich" }),
        ]);

        store.copyMechanicsToUpgrades(TIERS[0]);

        expect(rowOf(store, TIERS[1])?.fields.ActivatorTag).toBe("");
    });

    it("creates a row on a tier that has none, and stays idempotent when clicked twice", () => {
        const store = makeStore([activateRow(TIERS[0], 0, { ActivatorType: "BallStop" })]);

        const first = store.copyMechanicsToUpgrades(TIERS[0]);
        expect(first).toEqual({ tiers: 2, updated: 0, added: 2 });
        expect(store.mechanics).toHaveLength(3);

        // Deterministic ids mean a second click rewrites the same rows instead of appending duplicates.
        store.copyMechanicsToUpgrades(TIERS[0]);
        expect(store.mechanics).toHaveLength(3);
    });

    it("never touches the tiers' own item columns — that's what upgrades are made of", () => {
        const store = makeStore([activateRow(TIERS[0], 0, { ActivatorType: "BallStop" })], {
            [TIERS[0]]: { ValueMin: "1", Cost: "3" },
            [TIERS[1]]: { ValueMin: "5", Cost: "9" },
        });

        store.copyMechanicsToUpgrades(TIERS[0]);

        expect(store.getItem(TIERS[1])?.raw).toMatchObject({ ValueMin: "5", Cost: "9" });
        expect(store.getItem(TIERS[1])?.valueMin).toBe(5);
        // Nothing about the items themselves changed, so none of them is queued for export.
        expect(store.blueprintDirtyItemIds.size).toBe(0);
    });

    it("does nothing for an item that isn't in a chain, or has no mechanics of its own", () => {
        const loner = makeStore([activateRow("c_loner", 0, { ActivatorType: "BallStop" })]);
        expect(loner.copyMechanicsToUpgrades("c_loner")).toEqual({ tiers: 0, updated: 0, added: 0 });

        const noMechanics = makeStore([activateRow(TIERS[1], 0, { ActivatorType: "BallPass" })]);
        expect(noMechanics.copyMechanicsToUpgrades(TIERS[0])).toEqual({ tiers: 0, updated: 0, added: 0 });
    });

    it("marks copied rows for export the right way: edits in place, new rows appended", () => {
        const store = makeStore([
            activateRow(TIERS[0], 0, { ActivatorType: "BallStop" }),
            activateRow(TIERS[1], 0, { ActivatorType: "BallPass" }),
            // TIERS[2] has no row, so it gets a brand-new one.
        ]);

        store.copyMechanicsToUpgrades(TIERS[0]);

        expect([...store.blueprintEditedMechanicRowIds]).toEqual([`MechActivate:${TIERS[1]}:0`]);
        expect([...store.blueprintNewMechanicRowIds]).toEqual([`blueprint:copy:${TIERS[2]}:MechActivate:0`]);
    });
});
