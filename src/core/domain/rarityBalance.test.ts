import { describe, expect, it } from "vitest";
import { columnAppliesTo, findTrendIssues, parseNumericCell, summarizeByRarity } from "./rarityBalance";
import type { Item } from "../models/Item";

function item(id: string, rarity: string, raw: Record<string, string>, itemType = "Card"): Item {
    return { id, itemType, tags: [], raw: { ItemId: id, Rarity: rarity, ...raw } };
}

describe("parseNumericCell", () => {
    it("tells a blank cell apart from a zero", () => {
        expect(parseNumericCell("")).toBeNull();
        expect(parseNumericCell("   ")).toBeNull();
        expect(parseNumericCell(undefined)).toBeNull();
        expect(parseNumericCell("0")).toBe(0);
    });

    it("reads negatives and comma decimals, since the sheet has both", () => {
        expect(parseNumericCell("-3")).toBe(-3);
        expect(parseNumericCell("1,5")).toBe(1.5);
    });

    it("returns null for something that isn't a number at all", () => {
        expect(parseNumericCell("много")).toBeNull();
    });
});

describe("columnAppliesTo", () => {
    it("keeps Overheat off Artefacts, whose sheet has no such column", () => {
        expect(columnAppliesTo("Overheat", "Card")).toBe(true);
        expect(columnAppliesTo("Overheat", "House")).toBe(true);
        expect(columnAppliesTo("Overheat", "Artefact")).toBe(false);
        expect(columnAppliesTo("MoneyValue", "Artefact")).toBe(true);
    });
});

describe("summarizeByRarity", () => {
    it("orders buckets weakest-first regardless of input order", () => {
        const stats = summarizeByRarity(
            [item("a", "Rare", { MoneyValue: "1" }), item("b", "Common", { MoneyValue: "1" }), item("c", "Uniq", { MoneyValue: "1" })],
            "MoneyValue"
        );
        expect(stats.map((entry) => entry.rarity)).toEqual(["Common", "Rare", "Uniq"]);
    });

    it("puts items with no rarity in a trailing bucket rather than dropping them", () => {
        const stats = summarizeByRarity(
            [item("a", "", { MoneyValue: "5" }), item("b", "Common", { MoneyValue: "1" })],
            "MoneyValue"
        );
        expect(stats.map((entry) => entry.rarity)).toEqual(["Common", "—"]);
    });

    it("excludes blank cells from the numbers but still counts the item", () => {
        const stats = summarizeByRarity(
            [item("a", "Common", { MoneyValue: "4" }), item("b", "Common", { MoneyValue: "" })],
            "MoneyValue"
        );
        expect(stats[0].itemCount).toBe(2);
        expect(stats[0].values).toEqual([4]);
        // The blank must not be averaged in as a zero.
        expect(stats[0].mean).toBe(4);
    });

    it("computes quartiles from real values in the data", () => {
        const items = [1, 2, 3, 4, 5].map((n) => item(`i${n}`, "Common", { MoneyValue: String(n) }));
        const [stats] = summarizeByRarity(items, "MoneyValue");
        expect([stats.min, stats.p25, stats.median, stats.p75, stats.max]).toEqual([1, 2, 3, 4, 5]);
        expect(stats.mean).toBe(3);
    });

    it("skips items whose table lacks the column", () => {
        const stats = summarizeByRarity(
            [item("a", "Common", { Overheat: "10" }), item("b", "Common", { Overheat: "99" }, "Artefact")],
            "Overheat"
        );
        expect(stats[0].itemCount).toBe(1);
        expect(stats[0].values).toEqual([10]);
    });
});

describe("findTrendIssues", () => {
    const bucket = (rarity: string, values: number[]) => summarizeByRarity(
        values.map((value, index) => item(`${rarity}${index}`, rarity, { MoneyValue: String(value) })),
        "MoneyValue"
    )[0];

    it("is quiet when each rarity clearly sits above the previous one", () => {
        const stats = [bucket("Common", [1, 2, 3]), bucket("Uncommon", [10, 11, 12]), bucket("Rare", [20, 21, 22])];
        expect(findTrendIssues(stats)).toEqual([]);
    });

    it("flags a rarity whose median dropped — the inverted case in the real data", () => {
        const stats = [bucket("Uncommon", [20, 20, 20]), bucket("Rare", [2, 2, 2])];
        const [issue] = findTrendIssues(stats);
        expect(issue.kind).toBe("not-increasing");
        expect(issue.rarity).toBe("Rare");
    });

    it("flags bands that overlap even though the medians do rise", () => {
        const stats = [bucket("Common", [1, 5, 9]), bucket("Uncommon", [4, 6, 20])];
        const [issue] = findTrendIssues(stats);
        expect(issue.kind).toBe("overlapping");
        expect(issue.detail).toContain("Common");
    });

    it("reports each rarity at most once, preferring the more serious complaint", () => {
        const stats = [bucket("Common", [10, 10, 10]), bucket("Uncommon", [1, 1, 1])];
        expect(findTrendIssues(stats)).toHaveLength(1);
    });

    it("ignores the no-rarity bucket and empty ones", () => {
        const stats = [bucket("Common", [1, 2, 3]), bucket("—", [99]), bucket("Uncommon", [10])];
        expect(findTrendIssues(stats)).toEqual([]);
    });
});
