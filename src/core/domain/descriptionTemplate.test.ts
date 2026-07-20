import { describe, expect, it } from "vitest";
import { parseItemDescription, TAG_ICON_BASE_PATH } from "./descriptionTemplate";
import { SPRITE_BASE_PATH } from "./sprites";
import type { Item } from "../models/Item";

function makeItem(overrides: Partial<Item> = {}): Item {
    return { id: "test-item", tags: [], raw: {}, ...overrides };
}

describe("parseItemDescription", () => {
    it("substitutes {ValueOrRange} as a min—max range, even when min === max", () => {
        expect(parseItemDescription(makeItem({ valueMin: 3, valueMax: 5 }), "Урон: {ValueOrRange}")).toEqual([
            { kind: "text", value: "Урон: 3—5" },
        ]);

        expect(parseItemDescription(makeItem({ valueMin: 5, valueMax: 5 }), "{ValueOrRange}")).toEqual([
            { kind: "text", value: "5—5" },
        ]);
    });

    it("substitutes {ValueOrRange2} as the midpoint of valueMin/valueMax", () => {
        expect(parseItemDescription(makeItem({ valueMin: 3, valueMax: 5 }), "{ValueOrRange2}$")).toEqual([
            { kind: "text", value: "4$" },
        ]);

        expect(parseItemDescription(makeItem({ valueMin: 3, valueMax: 4 }), "{ValueOrRange2}")).toEqual([
            { kind: "text", value: "3.5" },
        ]);
    });

    it("resolves {ValueOrRange}/{ValueOrRange2} to an empty string when the item has no value range", () => {
        expect(parseItemDescription(makeItem(), "Даёт {ValueOrRange2}$")).toEqual([
            { kind: "text", value: "Даёт $" },
        ]);
    });

    it("falls back to a raw column for any other {ColumnName} placeholder", () => {
        const item = makeItem({ raw: { MoneyValue: "50" } });
        expect(parseItemDescription(item, "Даёт {MoneyValue}$")).toEqual([{ kind: "text", value: "Даёт 50$" }]);
    });

    it("leaves an unresolvable placeholder untouched instead of dropping it", () => {
        expect(parseItemDescription(makeItem(), "{Unknown}")).toEqual([{ kind: "text", value: "{Unknown}" }]);
    });

    it("resolves a [img] tag pointing at the tag-icon folder, with its declared width", () => {
        const result = parseItemDescription(
            makeItem(),
            "[img width=40]res://roulette_interface/Icons_tags/ui_icon_show_business.png[/img]"
        );
        expect(result).toEqual([
            {
                kind: "icon",
                src: `${TAG_ICON_BASE_PATH}ui_icon_show_business.png`,
                width: 40,
                alt: "ui_icon_show_business.png",
            },
        ]);
    });

    it("resolves a [img] tag pointing at the card-sprite folder, defaulting width when omitted", () => {
        const result = parseItemDescription(
            makeItem(),
            "[img]res://roulette_interface/pod-mini characters/some_card_mini.png[/img]"
        );
        expect(result).toEqual([
            { kind: "icon", src: `${SPRITE_BASE_PATH}some_card_mini.png`, width: 24, alt: "some_card_mini.png" },
        ]);
    });

    it("keeps the raw BBCode tag as text when the res:// folder isn't a synced one", () => {
        const raw = "[img width=20]res://some/other/folder/x.png[/img]";
        expect(parseItemDescription(makeItem(), raw)).toEqual([{ kind: "text", value: raw }]);
    });

    it("splits text/icon/text correctly for a description mixing prose, a value, and an icon", () => {
        const item = makeItem({ valueMin: 2, valueMax: 2 });
        const raw = "Даёт {ValueOrRange}$ за [img width=16]res://roulette_interface/Icons_tags/coin.png[/img] монету.";

        expect(parseItemDescription(item, raw)).toEqual([
            { kind: "text", value: "Даёт 2—2$ за " },
            { kind: "icon", src: `${TAG_ICON_BASE_PATH}coin.png`, width: 16, alt: "coin.png" },
            { kind: "text", value: " монету." },
        ]);
    });
});
