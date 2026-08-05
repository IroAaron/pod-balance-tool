import { describe, expect, it } from "vitest";
import { buildImportDescriptionText, type ImportIconContext } from "./importText";
import type { Item } from "../models/Item";

function makeContext(overrides: Partial<ImportIconContext> = {}): ImportIconContext {
    return {
        items: [],
        itemIcons: {},
        tagIcons: [],
        glossary: [],
        ...overrides,
    };
}

describe("buildImportDescriptionText", () => {
    it("leaves plain text and unrecognized BBCode/placeholders completely untouched", () => {
        const raw = "Дает {MoneyValue}. {ValueOrRange} [color=#123456]произвольный текст[/color] " +
            "[img width=16]res://roulette_interface/Icons_tags/unknown.svg[/img]";
        expect(buildImportDescriptionText(raw, makeContext())).toBe(raw);
    });

    it("converts a real [img] tag matching an item's own sprite into {item:ID}", () => {
        const item: Item = { id: "c_chel_foo", tags: [], raw: { CardSpriteNameMini: "card_track_foo_mini.png" } };
        const context = makeContext({ items: [item] });
        expect(
            buildImportDescriptionText(
                "Рядом с [img width=32]res://roulette_interface/pod-mini characters/card_track_foo_mini.png[/img] активируется.",
                context
            )
        ).toBe("Рядом с {item:c_chel_foo} активируется.");
    });

    it("converts a real [img] tag matching a TagIcon into {tag:Name}, case/casing-insensitively", () => {
        const context = makeContext({
            tagIcons: [{ id: "t1", tag: "Преступник", icon: "roulette_interface/icons-tags/ui_icon_criminal.svg" }],
        });
        expect(
            buildImportDescriptionText("[img width=40]res://roulette_interface/Icons_tags/ui_icon_criminal.svg[/img]", context)
        ).toBe("{tag:Преступник}");
    });

    it("converts a real [img] tag matching a GlossaryEntry's icon into that entry's own first phrase", () => {
        const glossary = [{ id: "g1", phrases: ["крутка", "круток"], icon: "roulette_interface/icons-tags/spin.svg" }];
        expect(
            buildImportDescriptionText("[img width=40]res://roulette_interface/Icons_tags/spin.svg[/img]", makeContext({ glossary }))
        ).toBe("крутка");
    });

    it("falls back to a {glossary:ID} token when the matched entry has no phrases", () => {
        const glossary = [{ id: "g1", phrases: [], icon: "roulette_interface/icons-tags/spin.svg" }];
        expect(
            buildImportDescriptionText("[img width=40]res://roulette_interface/Icons_tags/spin.svg[/img]", makeContext({ glossary }))
        ).toBe("{glossary:g1}");
    });

    it("leaves an [img] tag untouched when its res:// path matches no item/tagIcon/glossary entry", () => {
        const raw = "[img width=40]res://roulette_interface/Icons_tags/nobody_owns_this.svg[/img]";
        expect(buildImportDescriptionText(raw, makeContext())).toBe(raw);
    });

    it("unwraps a [color=#HEX] tag into bare text when HEX matches a color-only glossary entry", () => {
        const glossary = [{ id: "g1", phrases: ["желтого цвета"], color: "ffff80" }];
        expect(
            buildImportDescriptionText("на своей стороне [color=#ffff80]ЖЕЛТОГО ЦВЕТА[/color] при активации", makeContext({ glossary }))
        ).toBe("на своей стороне ЖЕЛТОГО ЦВЕТА при активации");
    });

    it("leaves a [color=#HEX] tag untouched when HEX matches no glossary entry, or the entry also has an icon/emoji", () => {
        const unmatched = "[color=#ffff80]text[/color]";
        expect(buildImportDescriptionText(unmatched, makeContext())).toBe(unmatched);

        const glossary = [{ id: "g1", phrases: ["x"], color: "ffff80", icon: "roulette_interface/icons-tags/x.svg" }];
        expect(buildImportDescriptionText(unmatched, makeContext({ glossary }))).toBe(unmatched);
    });

    it("converts a literal emoji matching an icon-less glossary entry into that entry's first phrase", () => {
        const glossary = [{ id: "g1", phrases: ["активирует"], emoji: "⚡" }];
        expect(buildImportDescriptionText("Соседняя ячейка ⚡ активируется.", makeContext({ glossary }))).toBe(
            "Соседняя ячейка активирует активируется."
        );
    });

    it("leaves a literal emoji untouched when the matching glossary entry also has an icon set", () => {
        const glossary = [{ id: "g1", phrases: ["активирует"], emoji: "⚡", icon: "roulette_interface/icons-tags/x.svg" }];
        expect(buildImportDescriptionText("⚡", makeContext({ glossary }))).toBe("⚡");
    });

    it("converts a literal emoji matching an item's manual icon override into {item:ID}", () => {
        const context = makeContext({ itemIcons: { c_chel_foo: "🎯" } });
        expect(buildImportDescriptionText("🎯 рядом активируется.", context)).toBe("{item:c_chel_foo} рядом активируется.");
    });

    it("resolves img tags before scanning for literal emoji, so a resolved token's own text never re-matches", () => {
        const glossary = [
            { id: "g1", phrases: ["крутка"], icon: "roulette_interface/icons-tags/spin.svg" },
            { id: "g2", phrases: ["крутка-emoji"], emoji: "🌀" },
        ];
        expect(
            buildImportDescriptionText("[img width=40]res://roulette_interface/Icons_tags/spin.svg[/img]", makeContext({ glossary }))
        ).toBe("крутка");
    });
});
