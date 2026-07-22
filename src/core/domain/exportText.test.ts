import { describe, expect, it } from "vitest";
import { buildExportDescriptionText, type ExportIconContext } from "./exportText";
import type { Item } from "../models/Item";

function makeContext(overrides: Partial<ExportIconContext> = {}): ExportIconContext {
    return {
        items: [],
        itemIcons: {},
        tagIcons: [],
        allGlossaryEntries: [],
        glossaryToApply: [],
        spriteWidthPx: 40,
        ...overrides,
    };
}

describe("buildExportDescriptionText", () => {
    it("leaves {ValueOrRange}/{MoneyValue} placeholders and existing [img]/[color] tags completely untouched", () => {
        const raw = "Дает {MoneyValue}. {ValueOrRange} [color=#{ColorHex}]своего цвета[/color] " +
            "[img width=16]res://roulette_interface/Icons_tags/foo.svg[/img]";
        expect(buildExportDescriptionText(raw, makeContext())).toBe(raw);
    });

    it("converts {item:ID} into real [img] BBCode using the item's own sprite filename", () => {
        const item: Item = { id: "c_chel_foo", tags: [], raw: { CardSpriteNameMini: "card_track_foo_mini.png" } };
        const context = makeContext({ items: [item], spriteWidthPx: 32 });
        expect(buildExportDescriptionText("Рядом с {item:c_chel_foo} активируется.", context)).toBe(
            "Рядом с [img width=32]res://roulette_interface/pod-mini characters/card_track_foo_mini.png[/img] активируется."
        );
    });

    it("converts {item:ID} into the manual emoji override when one is set, ignoring the real sprite", () => {
        const item: Item = { id: "c_chel_foo", tags: [], raw: { CardSpriteNameMini: "card_track_foo_mini.png" } };
        const context = makeContext({ items: [item], itemIcons: { c_chel_foo: "⚡" } });
        expect(buildExportDescriptionText("{item:c_chel_foo}", context)).toBe("⚡");
    });

    it("falls back to the 🧩 placeholder for a real item with neither manual icon nor sprite", () => {
        const item: Item = { id: "c_chel_bare", tags: [], raw: {} };
        expect(buildExportDescriptionText("{item:c_chel_bare}", makeContext({ items: [item] }))).toBe("🧩");
    });

    it("leaves {item:ID} literal when the id doesn't match any known item", () => {
        expect(buildExportDescriptionText("{item:unknown_id}", makeContext())).toBe("{item:unknown_id}");
    });

    it("converts {tag:Name} into real [img] BBCode via TagIcon, case-insensitively", () => {
        const context = makeContext({
            tagIcons: [{ id: "t1", tag: "Sport", icon: "roulette_interface/icons-tags/sport.svg" }],
            spriteWidthPx: 40,
        });
        expect(buildExportDescriptionText("{tag:sport}", context)).toBe(
            "[img width=40]res://roulette_interface/Icons_tags/sport.svg[/img]"
        );
    });

    it("leaves {tag:Name} literal when no TagIcon entry matches", () => {
        expect(buildExportDescriptionText("{tag:Unknown}", makeContext())).toBe("{tag:Unknown}");
    });

    it("replaces a glossary-matched phrase with its icon, only when passed in glossaryToApply", () => {
        const glossary = [{ id: "g1", phrases: ["активирует"], icon: "roulette_interface/icons-tags/activate.svg" }];
        expect(
            buildExportDescriptionText("Активирует соседнюю ячейку.", makeContext({ glossaryToApply: glossary }))
        ).toBe("[img width=40]res://roulette_interface/Icons_tags/activate.svg[/img] соседнюю ячейку.");

        // Same entry, but caller passed an empty glossaryToApply (e.g. descriptionMode === "text") — no substitution.
        expect(buildExportDescriptionText("Активирует соседнюю ячейку.", makeContext())).toBe(
            "Активирует соседнюю ячейку."
        );
    });

    it("replaces a glossary-matched phrase with its emoji when the entry has no icon", () => {
        const glossary = [{ id: "g1", phrases: ["активирует"], emoji: "⚡" }];
        expect(buildExportDescriptionText("Активирует.", makeContext({ glossaryToApply: glossary }))).toBe("⚡.");
    });

    it("never lets a glossary phrase match inside a just-resolved icon token's filename", () => {
        // Contrived but real risk case: an item id whose sprite filename contains a substring that would
        // otherwise match a configured glossary phrase — the placeholder-swap must shield it.
        const item: Item = { id: "c_active_thing", tags: [], raw: { CardSpriteNameMini: "card_active_mini.png" } };
        const glossary = [{ id: "g1", phrases: ["active"], emoji: "⚡" }];
        const context = makeContext({ items: [item], glossaryToApply: glossary });
        expect(buildExportDescriptionText("{item:c_active_thing}", context)).toBe(
            "[img width=40]res://roulette_interface/pod-mini characters/card_active_mini.png[/img]"
        );
    });

    it("converts {glossary:ID} into real [img] BBCode, regardless of glossaryToApply (unconditional, like item/tag tokens)", () => {
        const glossaryEntry = { id: "g1", phrases: ["активирует"], icon: "roulette_interface/icons-tags/activate.svg", enabled: false };
        const context = makeContext({ allGlossaryEntries: [glossaryEntry], glossaryToApply: [] });
        expect(buildExportDescriptionText("{glossary:g1}", context)).toBe(
            "[img width=40]res://roulette_interface/Icons_tags/activate.svg[/img]"
        );
    });

    it("converts {glossary:ID} into the entry's emoji when it has no icon", () => {
        const glossaryEntry = { id: "g1", phrases: ["активирует"], emoji: "⚡" };
        const context = makeContext({ allGlossaryEntries: [glossaryEntry] });
        expect(buildExportDescriptionText("{glossary:g1}", context)).toBe("⚡");
    });

    it("leaves {glossary:ID} literal when the id is unknown", () => {
        expect(buildExportDescriptionText("{glossary:missing}", makeContext())).toBe("{glossary:missing}");
    });
});
