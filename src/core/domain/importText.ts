import type { Item } from "../models/Item";
import type { GlossaryEntry } from "../models/GlossaryEntry";
import type { TagIcon } from "../models/TagIcon";
import { normalizeIconRelativePath } from "./descriptionTemplate";
import { getItemSpriteFileName } from "./sprites";

/**
 * Turns raw text as it comes back from the translations Sheet into the site's own editable shape — the inverse
 * direction of buildExportDescriptionText, run once at import time (see GameStore.applyImportResult) so a
 * translator who pasted a real `[img]res://...[/img]`/`[color=#...]...[/color]` tag or a literal emoji straight
 * into the Sheet (rather than inserting a token via the site's own UI) doesn't leave that raw BBCode sitting in
 * the site's raw-text edit view forever. Only reverses things this codebase can round-trip unambiguously:
 * - `[img]` resolving to a real item's own sprite -> `{item:ID}`
 * - `[img]` resolving to a curated TagIcon -> `{tag:Name}`
 * - `[img]` resolving to a GlossaryEntry's icon -> that entry's own first phrase (plain, readable text — the
 *   entry's phrase-matching already re-applies the icon on render, so this is the friendliest editable form)
 * - `[color=#HEX]text[/color]` matching a color-only glossary entry (no icon/emoji) -> the bare inner text
 * - a literal emoji matching a glossary entry's own emoji (no icon set) -> that entry's first phrase
 * - a literal emoji matching an item's manual icon override -> `{item:ID}`
 * Anything unrecognized (an unrelated res:// prefix, an unmatched hex color, a random emoji) is left completely
 * untouched, same "unresolved stays visible" philosophy as the rest of this pipeline.
 */
export interface ImportIconContext {
    items: Item[];
    itemIcons: Record<string, string>;
    tagIcons: TagIcon[];
    glossary: GlossaryEntry[];
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case/hyphen/casing-insensitive key for matching a res:// path (or an already-relative one) against a stored
 *  GlossaryEntry/TagIcon/item-sprite path — reuses the same folder-alias normalization the render/export sides
 *  already rely on, so either storage convention (Godot casing or the site's lowercase-hyphenated one) matches. */
function iconKey(path: string): string {
    return normalizeIconRelativePath(path).toLowerCase();
}

function firstPhrase(entry: GlossaryEntry): string | undefined {
    return entry.phrases.find((phrase) => phrase.trim());
}

const IMG_TAG_RE = /\[img(?:\s+width=\d+)?\]([\s\S]*?)\[\/img\]/gi;

function replaceImgTags(text: string, context: ImportIconContext): string {
    const itemIdBySpriteKey = new Map<string, string>();
    for (const item of context.items) {
        const spriteName = getItemSpriteFileName(item);
        if (spriteName) itemIdBySpriteKey.set(iconKey(`roulette_interface/pod-mini-characters/${spriteName}`), item.id);
    }

    const glossaryByIconKey = new Map<string, GlossaryEntry>();
    for (const entry of context.glossary) {
        if (entry.icon) glossaryByIconKey.set(iconKey(entry.icon), entry);
    }

    const tagIconByIconKey = new Map<string, TagIcon>();
    for (const entry of context.tagIcons) {
        if (entry.icon) tagIconByIconKey.set(iconKey(entry.icon), entry);
    }

    return text.replace(IMG_TAG_RE, (fullMatch, resPath: string) => {
        const key = iconKey(resPath);

        const itemId = itemIdBySpriteKey.get(key);
        if (itemId) return `{item:${itemId}}`;

        const glossaryEntry = glossaryByIconKey.get(key);
        if (glossaryEntry) return firstPhrase(glossaryEntry) ?? `{glossary:${glossaryEntry.id}}`;

        const tagIcon = tagIconByIconKey.get(key);
        if (tagIcon) return `{tag:${tagIcon.tag}}`;

        return fullMatch;
    });
}

const COLOR_TAG_RE = /\[color=#([0-9a-fA-F]{6})\]([\s\S]*?)\[\/color\]/g;

function unwrapGlossaryColorTags(text: string, glossary: GlossaryEntry[]): string {
    // Only entries the render/export side would actually resolve as color-only (see replaceGlossaryPhrases in
    // exportText.ts) — icon/emoji take priority there, so a color-tagged entry that also has an icon/emoji set
    // could never have been produced from that entry, and matching it anyway would risk unwrapping an unrelated
    // author-written color highlight that just happens to share a hex value.
    const colorOnlyHexes = new Set(
        glossary.filter((entry) => entry.color && !entry.icon && !entry.emoji).map((entry) => entry.color!.toLowerCase())
    );
    if (colorOnlyHexes.size === 0) return text;

    return text.replace(COLOR_TAG_RE, (fullMatch, hex: string, inner: string) =>
        colorOnlyHexes.has(hex.toLowerCase()) ? inner : fullMatch
    );
}

function replaceLiteralEmoji(text: string, context: ImportIconContext): string {
    type EmojiReplacement = { literal: string; replacement: string };
    const replacements: EmojiReplacement[] = [];

    for (const entry of context.glossary) {
        // Same reasoning as the color-tag guard above — icon wins over emoji on export, so only an icon-less
        // entry could actually have produced this literal emoji.
        if (entry.emoji && !entry.icon) {
            replacements.push({ literal: entry.emoji, replacement: firstPhrase(entry) ?? `{glossary:${entry.id}}` });
        }
    }
    for (const [itemId, emoji] of Object.entries(context.itemIcons)) {
        if (emoji) replacements.push({ literal: emoji, replacement: `{item:${itemId}}` });
    }

    const usable = replacements.filter((entry) => entry.literal.trim());
    if (usable.length === 0) return text;

    // Longest literal first, same reasoning as the glossary phrase matching elsewhere — avoids a shorter emoji
    // string matching inside a longer multi-codepoint one.
    const sorted = [...usable].sort((a, b) => b.literal.length - a.literal.length);
    const byLiteral = new Map(sorted.map((entry) => [entry.literal, entry.replacement]));
    const matchRe = new RegExp(sorted.map((entry) => escapeRegExp(entry.literal)).join("|"), "g");

    return text.replace(matchRe, (matched) => byLiteral.get(matched) ?? matched);
}

/** Runs all three reversals in sequence — img tags first (so a resolved token never contains stray BBCode for
 *  the later passes to trip over), then color tags, then literal emoji. */
export function buildImportDescriptionText(rawText: string, context: ImportIconContext): string {
    const withImgResolved = replaceImgTags(rawText, context);
    const withColorResolved = unwrapGlossaryColorTags(withImgResolved, context.glossary);
    return replaceLiteralEmoji(withColorResolved, context);
}
