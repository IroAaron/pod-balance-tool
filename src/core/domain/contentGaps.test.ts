import { describe, expect, it } from "vitest";
import { findItemsWithoutDescription } from "./contentGaps";
import type { Item } from "../models/Item";

function item(id: string): Item {
    return { id, itemType: "Card", tags: [], raw: { ItemId: id } };
}

function run(descriptions: Record<string, string>) {
    const items = Object.keys(descriptions).map(item);
    return findItemsWithoutDescription(items, (i) => descriptions[i.id]);
}

describe("findItemsWithoutDescription", () => {
    it("finds items with no description at all", () => {
        const found = run({ c_a: "", c_b: "Дает ${ValueOrRange}" });

        expect(found).toHaveLength(1);
        expect(found[0].item.id).toBe("c_a");
        expect(found[0].kind).toBe("empty");
    });

    it("flags a whitespace-only cell separately — it looks filled in the sheet but renders as nothing", () => {
        expect(run({ c_a: " " })[0].kind).toBe("whitespace");
        expect(run({ c_a: "   \n\t" })[0].kind).toBe("whitespace");
    });

    it("leaves a real description alone, including one that's only a token or an icon", () => {
        expect(run({ c_a: "{ValueOrRange}", c_b: "[img width=32]res://x.png[/img]" })).toEqual([]);
    });

    it("keeps the order it was given, so the caller controls sorting", () => {
        const found = run({ c_b: "", c_a: "", c_c: "есть текст" });
        expect(found.map((entry) => entry.item.id)).toEqual(["c_b", "c_a"]);
    });
});
