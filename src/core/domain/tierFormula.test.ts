import { describe, expect, it } from "vitest";
import { computeTierUpdates } from "./tierFormula";
import type { Item } from "../models/Item";

function tier(id: string, raw: Record<string, string>, itemType = "Card"): Item {
    return { id, itemType, tags: [], raw: { ItemId: id, ...raw } };
}

/** A chain shaped like the real ones: 4/4/3 doubling each tier. */
function realisticChain(): Item[] {
    return [
        tier("c_x_1", { ValueMin: "4", ValueMax: "4", MoneyValue: "3" }),
        tier("c_x_2", { ValueMin: "8", ValueMax: "8", MoneyValue: "6" }),
        tier("c_x_3", { ValueMin: "16", ValueMax: "16", MoneyValue: "12" }),
    ];
}

describe("computeTierUpdates", () => {
    it("reports nothing when the formula reproduces what's already there", () => {
        const { changes, skips } = computeTierUpdates([realisticChain()], { ValueMin: "prev * 2" });
        expect(changes).toEqual([]);
        expect(skips).toEqual([]);
    });

    it("cascades: tier 3 is derived from the tier 2 this run just produced", () => {
        const { changes } = computeTierUpdates([realisticChain()], { ValueMin: "prev * 3" });
        expect(changes).toEqual([
            { itemId: "c_x_2", tier: 2, column: "ValueMin", from: "8", to: "12" },
            // 12 * 3, not the sheet's 8 * 3 — that's the whole point of cascading.
            { itemId: "c_x_3", tier: 3, column: "ValueMin", from: "16", to: "36" },
        ]);
    });

    it("keeps `base` pinned to the first tier while `prev` moves", () => {
        const { changes } = computeTierUpdates([realisticChain()], { ValueMin: "base + tier" });
        expect(changes.map((change) => change.to)).toEqual(["6", "7"]);
    });

    it("applies a different formula per column in one pass", () => {
        const { changes } = computeTierUpdates([realisticChain()], {
            ValueMin: "prev * 2",
            MoneyValue: "prev + 10",
        });
        expect(changes.filter((c) => c.column === "MoneyValue").map((c) => `${c.from}->${c.to}`)).toEqual([
            "6->13",
            "12->23",
        ]);
        expect(changes.filter((c) => c.column === "ValueMin")).toEqual([]);
    });

    it("lets one parameter key off another tier's parameter", () => {
        const { changes } = computeTierUpdates([realisticChain()], { MoneyValue: "min" });
        // Tier 2 takes tier 1's ValueMin (4); tier 3 takes tier 2's ValueMin (8, untouched by any formula).
        expect(changes.map((c) => `${c.itemId}=${c.to}`)).toEqual(["c_x_2=4", "c_x_3=8"]);
    });

    it("rounds away float noise", () => {
        const chain = [tier("c_y_1", { MoneyValue: "10" }), tier("c_y_2", { MoneyValue: "0" })];
        const { changes } = computeTierUpdates([chain], { MoneyValue: "prev / 3" });
        expect(changes[0].to).toBe("3.3333");
    });

    it("does nothing at all when every formula is blank", () => {
        expect(computeTierUpdates([realisticChain()], { ValueMin: "", MoneyValue: "   " })).toEqual({
            changes: [],
            skips: [],
        });
    });

    it("skips a chain shorter than two tiers", () => {
        expect(computeTierUpdates([[tier("c_solo_1", { ValueMin: "5" })]], { ValueMin: "prev * 2" }).changes).toEqual(
            []
        );
    });

    it("skips, with a reason, when the previous tier's cell is blank", () => {
        const chain = [tier("c_z_1", { ValueMin: "" }), tier("c_z_2", { ValueMin: "8" })];
        const { changes, skips } = computeTierUpdates([chain], { ValueMin: "prev * 2" });
        expect(changes).toEqual([]);
        expect(skips[0]).toMatchObject({ itemId: "c_z_2", column: "ValueMin" });
        expect(skips[0].reason).toContain("пустой");
    });

    it("skips, with the parser's message, when the formula is broken", () => {
        const { changes, skips } = computeTierUpdates([realisticChain()], { ValueMin: "prev * wat" });
        expect(changes).toEqual([]);
        expect(skips[0].reason).toContain("wat");
    });

    it("never writes Overheat onto an Artefact, whose sheet has no such column", () => {
        const chain = [
            tier("a_1", { Overheat: "10", MoneyValue: "1" }, "Artefact"),
            tier("a_2", { Overheat: "20", MoneyValue: "2" }, "Artefact"),
        ];
        const { changes } = computeTierUpdates([chain], { Overheat: "prev * 5", MoneyValue: "prev * 5" });
        expect(changes.map((c) => c.column)).toEqual(["MoneyValue"]);
    });

    it("handles several chains independently", () => {
        const other = [tier("c_w_1", { ValueMin: "1" }), tier("c_w_2", { ValueMin: "1" })];
        const { changes } = computeTierUpdates([realisticChain(), other], { ValueMin: "prev * 10" });
        expect(changes.map((c) => c.itemId)).toEqual(["c_x_2", "c_x_3", "c_w_2"]);
    });
});
