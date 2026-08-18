import { describe, expect, it } from "vitest";
import { findUpgradeDescriptionMismatches } from "./upgradeConsistency";
import type { Item } from "../models/Item";

function item(id: string): Item {
    return { id, itemType: "Card", tags: [], raw: { ItemId: id } };
}

/** Real shape: "Вор" / "Вор+" / "Вор++" share one template, only ValueMin/ValueMax differ per tier. */
const chain = { id: "thief", itemIds: ["c_thief_1", "c_thief_2", "c_thief_3"] };
const getItem = (id: string) => (id.startsWith("c_thief") ? item(id) : undefined);

function run(descriptions: Record<string, string>) {
    return findUpgradeDescriptionMismatches([chain], getItem, (i) => descriptions[i.id] ?? "");
}

describe("findUpgradeDescriptionMismatches", () => {
    it("stays quiet when every tier shares the same template", () => {
        const same = "Дает ${ValueOrRange} при активации";
        expect(run({ c_thief_1: same, c_thief_2: same, c_thief_3: same })).toEqual([]);
    });

    it("stays quiet when tiers differ only in the values a token resolves to", () => {
        // The template is identical; ValueMin/ValueMax live on the item, not in the text, so nothing to report.
        const template = "Дает ${ValueOrRange} при активации";
        expect(run({ c_thief_1: template, c_thief_2: template, c_thief_3: template })).toEqual([]);
    });

    it("reports a chain whose template was reworded on one tier", () => {
        const [mismatch] = run({
            c_thief_1: "Дает ${ValueOrRange} при активации",
            c_thief_2: "Дает ${ValueOrRange} при активации",
            c_thief_3: "Дает ${ValueOrRange} за активацию",
        });

        expect(mismatch.chainId).toBe("thief");
        expect(mismatch.tiers.map((t) => t.item.id)).toEqual(["c_thief_1", "c_thief_2", "c_thief_3"]);
        expect(mismatch.tiers.map((t) => t.matchesFirst)).toEqual([true, true, false]);
    });

    it("reports a tier whose description is missing while the others have one", () => {
        const [mismatch] = run({ c_thief_1: "Дает ${ValueOrRange}", c_thief_2: "", c_thief_3: "Дает ${ValueOrRange}" });

        expect(mismatch.tiers.map((t) => t.matchesFirst)).toEqual([true, false, true]);
    });

    it("ignores leading/trailing whitespace, which is invisible and never deliberate", () => {
        const text = "Дает ${ValueOrRange}";
        expect(run({ c_thief_1: text, c_thief_2: `  ${text}`, c_thief_3: `${text}\n` })).toEqual([]);
    });

    it("ignores a chain nobody has written a description for yet", () => {
        expect(run({})).toEqual([]);
    });

    it("ignores a chain with only one known tier", () => {
        const partial = { id: "solo", itemIds: ["c_thief_1", "c_missing"] };
        const found = findUpgradeDescriptionMismatches([partial], getItem, () => "что угодно");
        expect(found).toEqual([]);
    });
});
