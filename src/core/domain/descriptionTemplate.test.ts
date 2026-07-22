import { describe, expect, it } from "vitest";
import { parseItemDescription, TAG_ICON_BASE_PATH } from "./descriptionTemplate";
import { SPRITE_BASE_PATH } from "./sprites";
import type { Item } from "../models/Item";
import type { MechanicRow } from "../models/Mechanic";

function makeItem(overrides: Partial<Item> = {}): Item {
    return { id: "test-item", tags: [], raw: {}, ...overrides };
}

function makeMechanic(itemId: string, fields: Record<string, string>): MechanicRow {
    return { id: `${itemId}-mech`, table: "MechActivate", itemId, fields };
}

describe("parseItemDescription", () => {
    it("substitutes {ValueOrRange} as a min—max range, even when min === max", () => {
        expect(parseItemDescription(makeItem({ valueMin: 3, valueMax: 5 }), "Урон: {ValueOrRange}", [])).toEqual([
            { kind: "text", value: "Урон: 3—5" },
        ]);

        expect(parseItemDescription(makeItem({ valueMin: 5, valueMax: 5 }), "{ValueOrRange}", [])).toEqual([
            { kind: "text", value: "5—5" },
        ]);
    });

    it("substitutes {ValueOrRange2} as the midpoint of valueMin/valueMax", () => {
        expect(parseItemDescription(makeItem({ valueMin: 3, valueMax: 5 }), "{ValueOrRange2}$", [])).toEqual([
            { kind: "text", value: "4$" },
        ]);

        expect(parseItemDescription(makeItem({ valueMin: 3, valueMax: 4 }), "{ValueOrRange2}", [])).toEqual([
            { kind: "text", value: "3.5" },
        ]);
    });

    it("resolves {ValueOrRange}/{ValueOrRange2} to an empty string when the item has no value range", () => {
        expect(parseItemDescription(makeItem(), "Даёт {ValueOrRange2}$", [])).toEqual([
            { kind: "text", value: "Даёт $" },
        ]);
    });

    it("falls back to a raw column for any other {ColumnName} placeholder", () => {
        const item = makeItem({ raw: { MoneyValue: "50" } });
        expect(parseItemDescription(item, "Даёт {MoneyValue}$", [])).toEqual([{ kind: "text", value: "Даёт 50$" }]);
    });

    it("resolves {TargetCount}/{ActivationCount} from the item's first mechanic row", () => {
        const item = makeItem();
        const mechanics = [makeMechanic("test-item", { TargetCount: "3", ActivationCount: "2" })];
        expect(parseItemDescription(item, "{TargetCount} ячеек, {ActivationCount} раза", mechanics)).toEqual([
            { kind: "text", value: "3 ячеек, 2 раза" },
        ]);
    });

    it("uses only the item's first mechanic row when it has several", () => {
        const item = makeItem();
        const mechanics = [
            makeMechanic("test-item", { TargetCount: "1" }),
            makeMechanic("test-item", { TargetCount: "99" }),
        ];
        expect(parseItemDescription(item, "{TargetCount}", mechanics)).toEqual([{ kind: "text", value: "1" }]);
    });

    it("leaves an unresolvable placeholder untouched instead of dropping it", () => {
        expect(parseItemDescription(makeItem(), "{Unknown}", [])).toEqual([{ kind: "text", value: "{Unknown}" }]);
    });

    it("resolves a [img] tag pointing at the tag-icon folder, with its declared width", () => {
        const result = parseItemDescription(
            makeItem(),
            "[img width=40]res://roulette_interface/Icons_tags/ui_icon_show_business.png[/img]",
            []
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
            "[img]res://roulette_interface/pod-mini characters/some_card_mini.png[/img]",
            []
        );
        expect(result).toEqual([
            { kind: "icon", src: `${SPRITE_BASE_PATH}some_card_mini.png`, width: 24, alt: "some_card_mini.png" },
        ]);
    });

    it("keeps the raw BBCode tag as text when the res:// folder isn't a synced one", () => {
        const raw = "[img width=20]res://some/other/folder/x.png[/img]";
        expect(parseItemDescription(makeItem(), raw, [])).toEqual([{ kind: "text", value: raw }]);
    });

    it("resolves [color=#{ColorHex}] to the item's single PossibleColors value", () => {
        const item = makeItem({ raw: { PossibleColors: "Red" } });
        expect(parseItemDescription(item, "[color=#{ColorHex}]своего цвета[/color]", [])).toEqual([
            { kind: "colored-text", value: "своего цвета", colors: ["#ff8080"] },
        ]);
    });

    it("resolves [color=#{ColorHex}] to every matching hex when the item has several PossibleColors (for the shimmer)", () => {
        const item = makeItem({ raw: { PossibleColors: "Blue, Green, Yellow, Red" } });
        expect(parseItemDescription(item, "[color=#{ColorHex}]своего цвета[/color]", [])).toEqual([
            { kind: "colored-text", value: "своего цвета", colors: ["#8080ff", "#80ff80", "#ffff80", "#ff8080"] },
        ]);
    });

    it("degrades [color=#{ColorHex}] to plain text when the item has no resolvable color (e.g. NoColor)", () => {
        const item = makeItem({ raw: { PossibleColors: "NoColor" } });
        expect(parseItemDescription(item, "[color=#{ColorHex}]своего цвета[/color]", [])).toEqual([
            { kind: "text", value: "своего цвета" },
        ]);
    });

    it("renders a literal hex [color=#ff8080] as-is, independent of the item's own colors", () => {
        const item = makeItem({ raw: { PossibleColors: "Blue" } });
        expect(parseItemDescription(item, "[color=#ff8080]красного цвета[/color]", [])).toEqual([
            { kind: "colored-text", value: "красного цвета", colors: ["#ff8080"] },
        ]);
    });

    it("splits text/icon/text correctly for a description mixing prose, a value, and an icon", () => {
        const item = makeItem({ valueMin: 2, valueMax: 2 });
        const raw = "Даёт {ValueOrRange}$ за [img width=16]res://roulette_interface/Icons_tags/coin.png[/img] монету.";

        expect(parseItemDescription(item, raw, [])).toEqual([
            { kind: "text", value: "Даёт 2—2$ за " },
            { kind: "icon", src: `${TAG_ICON_BASE_PATH}coin.png`, width: 16, alt: "coin.png" },
            { kind: "text", value: " монету." },
        ]);
    });

    it("handles a real-shaped description: value + color span together", () => {
        const item = makeItem({ raw: { PossibleColors: "Green" }, valueMin: 4, valueMax: 4 });
        const raw = "Дает +{ValueOrRange2} к ценности случайной ячейке [color=#{ColorHex}]своего цвета[/color] при активации.";

        expect(parseItemDescription(item, raw, [])).toEqual([
            { kind: "text", value: "Дает +4 к ценности случайной ячейке " },
            { kind: "colored-text", value: "своего цвета", colors: ["#80ff80"] },
            { kind: "text", value: " при активации." },
        ]);
    });
});

describe("parseItemDescription with a glossary (icons-emoji mode)", () => {
    it("leaves text untouched when no glossary is passed (default [])", () => {
        expect(parseItemDescription(makeItem(), "Активирует ячейку.", [])).toEqual([
            { kind: "text", value: "Активирует ячейку." },
        ]);
    });

    it("replaces a matched phrase with its icon and leaves the rest of the text as-is", () => {
        const glossary = [{ id: "g1", phrases: ["Активирует"], icon: "roulette_interface/icons-tags/activate.svg" }];
        expect(parseItemDescription(makeItem(), "Активирует соседнюю ячейку.", [], glossary)).toEqual([
            {
                kind: "icon",
                src: `${import.meta.env.BASE_URL}roulette_interface/icons-tags/activate.svg`,
                width: 24,
                alt: "Активирует",
                note: "Активирует",
            },
            { kind: "text", value: " соседнюю ячейку." },
        ]);
    });

    it("falls back to emoji when the entry has no icon", () => {
        const glossary = [{ id: "g1", phrases: ["Активирует"], emoji: "⚡" }];
        expect(parseItemDescription(makeItem(), "Активирует ячейку.", [], glossary)).toEqual([
            { kind: "emoji", value: "⚡", note: "Активирует" },
            { kind: "text", value: " ячейку." },
        ]);
    });

    it("prefers icon over emoji when an entry has both", () => {
        const glossary = [
            { id: "g1", phrases: ["Активирует"], icon: "roulette_interface/icons-tags/activate.svg", emoji: "⚡" },
        ];
        expect(parseItemDescription(makeItem(), "Активирует ячейку.", [], glossary)).toEqual([
            {
                kind: "icon",
                src: `${import.meta.env.BASE_URL}roulette_interface/icons-tags/activate.svg`,
                width: 24,
                alt: "Активирует",
                note: "Активирует",
            },
            { kind: "text", value: " ячейку." },
        ]);
    });

    it("matches case-insensitively", () => {
        const glossary = [{ id: "g1", phrases: ["активирует"], emoji: "⚡" }];
        expect(parseItemDescription(makeItem(), "Активирует ячейку.", [], glossary)).toEqual([
            { kind: "emoji", value: "⚡", note: "активирует" },
            { kind: "text", value: " ячейку." },
        ]);
    });

    it("prefers the longer of two overlapping phrases (real 'свой цвет' vs 'цвет' shape)", () => {
        const glossary = [
            { id: "g1", phrases: ["цвет"], emoji: "🎨" },
            { id: "g2", phrases: ["свой цвет"], emoji: "🟢" },
        ];
        expect(parseItemDescription(makeItem(), "Перекрашивает в свой цвет.", [], glossary)).toEqual([
            { kind: "text", value: "Перекрашивает в " },
            { kind: "emoji", value: "🟢", note: "свой цвет" },
            { kind: "text", value: "." },
        ]);
    });

    it("uses the entry's own note over falling back to the phrase, when set", () => {
        const glossary = [{ id: "g1", phrases: ["Активирует"], emoji: "⚡", note: "Активация — MechActivate" }];
        expect(parseItemDescription(makeItem(), "Активирует ячейку.", [], glossary)).toEqual([
            { kind: "emoji", value: "⚡", note: "Активация — MechActivate" },
            { kind: "text", value: " ячейку." },
        ]);
    });

    it("falls back to the phrase for the note when the entry's note is blank/whitespace", () => {
        const glossary = [{ id: "g1", phrases: ["Активирует"], emoji: "⚡", note: "   " }];
        expect(parseItemDescription(makeItem(), "Активирует ячейку.", [], glossary)).toEqual([
            { kind: "emoji", value: "⚡", note: "Активирует" },
            { kind: "text", value: " ячейку." },
        ]);
    });

    it("annotates a plain [img] icon already baked into the text when its path matches a glossary entry's icon", () => {
        // Real shape: a description already spells out an icon via [img] (not a phrase match at all) — if a
        // glossary entry documents that exact icon, hovering it should show the note too.
        const glossary = [
            { id: "g1", phrases: ["монета"], icon: "roulette_interface/icons-tags/coin.png", note: "Монетка — бонус" },
        ];
        const raw = "Дает [img width=16]res://roulette_interface/Icons_tags/coin.png[/img] очков.";
        expect(parseItemDescription(makeItem(), raw, [], glossary)).toEqual([
            { kind: "text", value: "Дает " },
            { kind: "icon", src: `${TAG_ICON_BASE_PATH}coin.png`, width: 16, alt: "coin.png", note: "Монетка — бонус" },
            { kind: "text", value: " очков." },
        ]);
    });

    it("ignores an entry with neither icon nor emoji set", () => {
        const glossary = [{ id: "g1", phrases: ["Активирует"] }];
        expect(parseItemDescription(makeItem(), "Активирует ячейку.", [], glossary)).toEqual([
            { kind: "text", value: "Активирует ячейку." },
        ]);
    });

    it("does not touch an already-resolved icon/colored-text part, only original text", () => {
        const item = makeItem({ raw: { PossibleColors: "Red" } });
        const glossary = [{ id: "g1", phrases: ["цвета"], emoji: "🎨" }];
        const raw = "[color=#{ColorHex}]своего цвета[/color] активирует.";
        expect(parseItemDescription(item, raw, [], glossary)).toEqual([
            { kind: "colored-text", value: "своего цвета", colors: ["#ff8080"] },
            { kind: "text", value: " активирует." },
        ]);
    });

    it("matches any of an entry's several phrases, all sharing the one icon/emoji", () => {
        const glossary = [{ id: "g1", phrases: ["активирует", "активация"], emoji: "⚡" }];
        expect(parseItemDescription(makeItem(), "Активация ячейки, затем активирует соседнюю.", [], glossary)).toEqual([
            { kind: "emoji", value: "⚡", note: "активация" },
            { kind: "text", value: " ячейки, затем " },
            { kind: "emoji", value: "⚡", note: "активирует" },
            { kind: "text", value: " соседнюю." },
        ]);
    });
});

describe("parseItemDescription with {item:ID}/{tag:Name} icon tokens", () => {
    const referencedItem = makeItem({ id: "c_chel_foo", raw: { CardSpriteNameMini: "card_track_foo_mini.png" } });

    it("resolves {item:ID} to the referenced item's real sprite when it has one", () => {
        const iconTokens = { items: [referencedItem], itemIcons: {}, tagIcons: [] };
        expect(parseItemDescription(makeItem(), "Рядом с {item:c_chel_foo} активируется.", [], [], iconTokens)).toEqual([
            { kind: "text", value: "Рядом с " },
            { kind: "icon", src: `${SPRITE_BASE_PATH}card_track_foo_mini.png`, width: 24, alt: "c_chel_foo" },
            { kind: "text", value: " активируется." },
        ]);
    });

    it("prefers a manual emoji override over the item's real sprite", () => {
        const iconTokens = { items: [referencedItem], itemIcons: { c_chel_foo: "⚡" }, tagIcons: [] };
        expect(parseItemDescription(makeItem(), "{item:c_chel_foo}", [], [], iconTokens)).toEqual([
            { kind: "emoji", value: "⚡" },
        ]);
    });

    it("falls back to the 🧩 placeholder for a real item with neither manual icon nor sprite", () => {
        const bareItem = makeItem({ id: "c_chel_bare" });
        const iconTokens = { items: [bareItem], itemIcons: {}, tagIcons: [] };
        expect(parseItemDescription(makeItem(), "{item:c_chel_bare}", [], [], iconTokens)).toEqual([
            { kind: "emoji", value: "🧩" },
        ]);
    });

    it("leaves {item:ID} as literal text when the id doesn't match any known item", () => {
        const iconTokens = { items: [], itemIcons: {}, tagIcons: [] };
        expect(parseItemDescription(makeItem(), "{item:unknown_id}", [], [], iconTokens)).toEqual([
            { kind: "text", value: "{item:unknown_id}" },
        ]);
    });

    it("resolves {tag:Name} to the matching TagIcon entry, case-insensitively", () => {
        const iconTokens = {
            items: [],
            itemIcons: {},
            tagIcons: [{ id: "t1", tag: "Sport", icon: "roulette_interface/icons-tags/sport.svg" }],
        };
        expect(parseItemDescription(makeItem(), "{tag:sport}", [], [], iconTokens)).toEqual([
            { kind: "icon", src: `${import.meta.env.BASE_URL}roulette_interface/icons-tags/sport.svg`, width: 24, alt: "Sport" },
        ]);
    });

    it("leaves {tag:Name} as literal text when no TagIcon entry matches", () => {
        const iconTokens = { items: [], itemIcons: {}, tagIcons: [] };
        expect(parseItemDescription(makeItem(), "{tag:Unknown}", [], [], iconTokens)).toEqual([
            { kind: "text", value: "{tag:Unknown}" },
        ]);
    });

    it("leaves both tokens as literal text when iconTokens isn't passed at all", () => {
        expect(parseItemDescription(makeItem(), "{item:c_chel_foo} {tag:Sport}", [])).toEqual([
            { kind: "text", value: "{item:c_chel_foo} {tag:Sport}" },
        ]);
    });
});
