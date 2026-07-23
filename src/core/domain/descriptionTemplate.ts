import type { Item } from "../models/Item";
import type { MechanicRow } from "../models/Mechanic";
import type { GlossaryEntry } from "../models/GlossaryEntry";
import type { TagIcon } from "../models/TagIcon";
import { SPRITE_BASE_PATH, getItemSpritePath, findRawValue } from "./sprites";

/**
 * "text" — the raw string from the translations table, completely unprocessed (no {placeholder}/[img]/[color]
 * handling at all — see ItemDescription.tsx, which bypasses parseItemDescription entirely for this mode).
 * "text-icons" ("Текст + Включенные записи") — [img]/[color=#...] BBCode and {placeholder}s resolved, plus
 * glossary entries whose own "enabled" checkbox (GlossaryPage) is on swapped in for their matched phrase.
 * "icons-emoji" ("Все записи") — same as "text-icons", but every glossary entry with an icon/emoji applies
 * regardless of its enabled checkbox — lets you review the full glossary against real descriptions. In both
 * cases unmatched text stays as plain text; this is additive, not a full replace of the description. The string
 * values themselves predate this 3-way split (the type used to mean "no glossary at all" / "every entry, no
 * enabled concept existed yet") — kept as-is since the slots map 1:1 onto the new modes, so no stored
 * `descriptionMode` value needs migrating.
 */
export type DescriptionMode = "text" | "text-icons" | "icons-emoji";

/** Site-wide display knobs for ItemDescription, editable on the Settings page and shared via Firestore. */
export interface DescriptionSettings {
    /** Literal width (px) every rendered icon uses — replaces whatever width a [img width=N] tag was authored
     *  with, and is what {item:ID}/{tag:Name} tokens (which have no width of their own) render at too. Used to
     *  be a multiplier applied on top of each tag's own authored width, back when the Google Sheet was the only
     *  place descriptions were written; now that the site itself authors them (including the Sheets export
     *  pipeline, which writes this value straight into the [img width=N] it generates), one site-wide literal
     *  width made more sense than preserving per-icon authored variance. */
    spriteWidthPx: number;

    /** Font size (px) for both plain and colored/shimmer description text. */
    fontSizePx: number;

    descriptionMode: DescriptionMode;

    /** Font size (px) of the glossary-note tooltip shown on a glossary-matched icon/emoji — see ItemDescription. */
    tooltipFontSizePx: number;
}

/** 40px matches the site's own default icon-insertion width — ItemDetailPage's plain-Typography ~16px body text. */
export const DEFAULT_DESCRIPTION_SETTINGS: DescriptionSettings = {
    spriteWidthPx: 40,
    fontSizePx: 16,
    descriptionMode: "text-icons",
    tooltipFontSizePx: 14,
};

/** Synced from the game repo's `roulette_interface/Icons_tags/` on every deploy — see .github/workflows/deploy.yml. */
export const TAG_ICON_BASE_PATH = `${import.meta.env.BASE_URL}roulette_interface/icons-tags/`;

/** Synced from the game repo's `roulette_interface/Icons_tags_fields/` — a separate folder from Icons_tags,
 *  holding the little field/line/corner indicator icons real descriptions reference (e.g. "on corner" markers).
 *  Found missing 2026-07-23: real descriptions had been referencing this folder all along, silently falling
 *  back to literal BBCode text since it was never in RES_PATH_PREFIXES nor synced anywhere. */
export const TAG_ICON_FIELDS_BASE_PATH = `${import.meta.env.BASE_URL}roulette_interface/icons-tags-fields/`;

/**
 * Descriptions embed images as Godot resource paths (`res://roulette_interface/<folder>/<file>.png`), matching
 * whatever the game's own BBCode renderer expects. Only these folders are synced into `public/roulette_interface/`
 * (renamed hyphen-case on the way in, see scripts/sync-sprites.mjs / deploy.yml) — an unrecognized prefix falls
 * through to the raw BBCode tag in parseItemDescription rather than a broken <img>.
 */
const RES_PATH_PREFIXES: Array<{ prefix: string; base: string }> = [
    { prefix: "res://roulette_interface/pod-mini characters/", base: SPRITE_BASE_PATH },
    { prefix: "res://roulette_interface/Icons_tags/", base: TAG_ICON_BASE_PATH },
    { prefix: "res://roulette_interface/Icons_tags_fields/", base: TAG_ICON_FIELDS_BASE_PATH },
];

function resolveResPath(resPath: string): string | undefined {
    const trimmed = resPath.trim();
    const match = RES_PATH_PREFIXES.find((entry) => trimmed.startsWith(entry.prefix));
    if (!match) return undefined;
    return `${match.base}${encodeURIComponent(trimmed.slice(match.prefix.length))}`;
}

/** Real palette confirmed by the user — PossibleColors' named values, not derivable from any CSV column. */
const COLOR_NAME_TO_HEX: Record<string, string> = {
    red: "ff8080",
    blue: "8080ff",
    yellow: "ffff80",
    green: "80ff80",
    gray: "bebebe",
    dark: "737373",
};

/** The item's own color(s) (Cards/Houses "PossibleColors", comma-separated) resolved to hex — "NoColor"/unknown names drop out. */
function itemColorHexes(item: Item): string[] {
    const raw = findRawValue(item.raw, "PossibleColors");
    if (!raw) return [];
    return raw
        .split(",")
        .map((entry) => COLOR_NAME_TO_HEX[entry.trim().toLowerCase()])
        .filter((hex): hex is string => Boolean(hex));
}

function formatNumber(value: number): string {
    // Trims float noise (3.5000000001) and trailing zeros (3.50 -> 3.5, 3.00 -> 3) without a fixed decimal count.
    return Number(value.toFixed(2)).toString();
}

/** "3—5" (or "5—5" when min === max — the game shows a degenerate range as-is, not collapsed to one number). */
function formatValueOrRange(item: Item): string {
    if (item.valueMin === undefined || item.valueMax === undefined) return "";
    return `${formatNumber(item.valueMin)}—${formatNumber(item.valueMax)}`;
}

/** Midpoint of valueMin/valueMax as a single number. */
function formatValueOrRange2(item: Item): string {
    if (item.valueMin === undefined || item.valueMax === undefined) return "";
    return formatNumber((item.valueMin + item.valueMax) / 2);
}

const PLACEHOLDER_RE = /\{([A-Za-z0-9_]+)\}/g;

/**
 * {TargetCount}/{ActivationCount} live on the item's own mechanic row (MechActivate/MechAddValue/...), not on
 * the item itself — per the user, always the item's first mechanic row (items are never expected to need a
 * second one for description purposes). {ColorHex} is deliberately left untouched here — it needs the
 * multi-color/gradient handling in parseColorAndImageTags, not a plain string substitution.
 */
function substitutePlaceholders(text: string, item: Item, firstMechanic: MechanicRow | undefined): string {
    return text.replace(PLACEHOLDER_RE, (match, field: string) => {
        if (field === "ColorHex") return match;
        if (field === "ValueOrRange") return formatValueOrRange(item);
        if (field === "ValueOrRange2") return formatValueOrRange2(item);
        return (
            findRawValue(item.raw, field) ??
            (firstMechanic ? findRawValue(firstMechanic.fields, field) : undefined) ??
            match
        );
    });
}

export type DescriptionPart =
    | { kind: "text"; value: string }
    | { kind: "icon"; src: string; width: number; alt: string; note?: string }
    | { kind: "colored-text"; value: string; colors: string[] }
    | { kind: "emoji"; value: string; note?: string };

const DEFAULT_ICON_WIDTH = 24;

// Matches either an [img] tag or a [color=#X]...[/color] span, so both can be found in one left-to-right scan.
const TOKEN_RE = /\[img(?:\s+width=(\d+))?\]([\s\S]*?)\[\/img\]|\[color=#([^\]]+)\]([\s\S]*?)\[\/color\]/gi;

function parseColorAndImageTags(text: string, item: Item): DescriptionPart[] {
    const parts: DescriptionPart[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(TOKEN_RE)) {
        const [fullMatch, widthStr, resPath, colorToken, innerText] = match;
        const index = match.index ?? 0;

        if (index > lastIndex) parts.push({ kind: "text", value: text.slice(lastIndex, index) });

        if (resPath !== undefined) {
            const src = resolveResPath(resPath);
            if (src) {
                parts.push({
                    kind: "icon",
                    src,
                    width: widthStr ? Number(widthStr) : DEFAULT_ICON_WIDTH,
                    alt: resPath.trim().split("/").pop() ?? "",
                });
            } else {
                // Unrecognized res:// folder — keep the raw tag visible instead of silently dropping it, so a
                // missing mapping is obvious rather than just vanishing from the description.
                parts.push({ kind: "text", value: fullMatch });
            }
        } else {
            // "{ColorHex}" means "this item's own color(s)"; anything else is already a literal hex from the sheet.
            const colors = colorToken === "{ColorHex}" ? itemColorHexes(item) : [colorToken];
            parts.push(
                colors.length > 0
                    ? { kind: "colored-text", value: innerText, colors: colors.map((hex) => `#${hex}`) }
                    : { kind: "text", value: innerText } // no resolvable color (e.g. "NoColor") — degrade to plain text
            );
        }

        lastIndex = index + fullMatch.length;
    }

    if (lastIndex < text.length) parts.push({ kind: "text", value: text.slice(lastIndex) });

    return parts;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** src for a glossary entry's icon, resolved the same way [img] tags in a description already are — a path
 *  relative to `public/` (e.g. "roulette_interface/icons-tags/foo.svg"), not a res:// BBCode tag. Exported so
 *  GlossaryPage's own live icon preview resolves identically to how the description renderer will actually show it. */
/** Folder names as they actually appear in Godot res:// paths (and as people naturally type/paste them into the
 *  glossary/tag-icon "icon" field, matching real description text) vs. the lowercase-hyphenated form the sync
 *  scripts (scripts/sync-sprites.mjs, deploy.yml) actually write to public/roulette_interface/ on disk. GitHub
 *  Pages serves from a case-sensitive filesystem, so typing the Godot-style casing 404s silently — found
 *  2026-07-23 via real broken entries on the deployed glossary ("Icons_tags_fields/..." and a path missing its
 *  "roulette_interface/" prefix entirely, both 404 while the canonical form 200'd). */
const ICON_FOLDER_ALIASES: Array<{ match: RegExp; canonical: string }> = [
    { match: /^icons[_-]tags[_-]fields$/i, canonical: "icons-tags-fields" },
    { match: /^icons[_-]tags$/i, canonical: "icons-tags" },
    { match: /^pod-mini[_ -]characters$/i, canonical: "pod-mini-characters" },
];

/** Exported so exportText.ts's reconstructResPath can normalize the same way before matching against its own
 *  canonical-prefix table — the export direction hit the exact same real-vs-canonical casing mismatch. */
export function normalizeIconRelativePath(icon: string): string {
    const segments = icon
        .trim()
        .replace(/^res:\/\//, "")
        .replace(/^\/+/, "")
        .split("/");

    const hasRootFolder = segments[0]?.toLowerCase() === "roulette_interface";
    const folderIndex = hasRootFolder ? 1 : 0;
    const alias = segments[folderIndex] ? ICON_FOLDER_ALIASES.find((entry) => entry.match.test(segments[folderIndex])) : undefined;
    if (!alias) return segments.join("/");

    segments[folderIndex] = alias.canonical;
    if (!hasRootFolder) segments.unshift("roulette_interface");
    else segments[0] = "roulette_interface";
    return segments.join("/");
}

export function glossaryIconSrc(icon: string): string {
    return `${import.meta.env.BASE_URL}${normalizeIconRelativePath(icon)}`;
}

type PhraseMatch = { phrase: string; entry: GlossaryEntry };

/**
 * Swaps known glossary phrases inside a description's plain-text parts for their icon/emoji, AND annotates any
 * icon already embedded directly via a real `[img]` tag (resolved by parseColorAndImageTags, so it was never a
 * text substitution at all) with the same note when that icon's path matches a glossary entry's own `icon` —
 * e.g. a description that already spells out `[img]...ui_icon_activation.svg[/img]` gets the "Активация" note
 * on hover too, not just phrase-substituted occurrences. Matching for the phrase-substitution part is
 * case-insensitive substring, longest phrase first across every phrase of every entry (same principle as
 * TOKEN_RE above), so a more specific phrase wins over a shorter one it happens to contain — including two
 * phrases that belong to the *same* entry. An entry with neither icon nor emoji set is a no-op.
 */
function applyGlossary(parts: DescriptionPart[], glossary: GlossaryEntry[]): DescriptionPart[] {
    const usable: PhraseMatch[] = [];
    for (const entry of glossary) {
        if (!entry.icon && !entry.emoji) continue;
        for (const phrase of entry.phrases) {
            if (phrase.trim()) usable.push({ phrase, entry });
        }
    }
    if (usable.length === 0) return parts;

    const sorted = [...usable].sort((a, b) => b.phrase.length - a.phrase.length);
    const byPhraseLower = new Map(sorted.map((match) => [match.phrase.toLowerCase(), match]));
    const matchRe = new RegExp(sorted.map((match) => escapeRegExp(match.phrase)).join("|"), "gi");

    const noteByIconSrc = new Map<string, string>();
    for (const entry of usable.map((match) => match.entry)) {
        if (!entry.icon) continue;
        noteByIconSrc.set(glossaryIconSrc(entry.icon), entry.note?.trim() || entry.phrases[0]);
    }

    return parts.flatMap((part): DescriptionPart[] => {
        if (part.kind === "icon" && !part.note) {
            const note = noteByIconSrc.get(part.src);
            if (note) return [{ ...part, note }];
        }
        if (part.kind !== "text") return [part];

        const pieces: DescriptionPart[] = [];
        let lastIndex = 0;
        for (const match of part.value.matchAll(matchRe)) {
            const index = match.index ?? 0;
            if (index > lastIndex) pieces.push({ kind: "text", value: part.value.slice(lastIndex, index) });

            const { phrase, entry } = byPhraseLower.get(match[0].toLowerCase())!;
            // `note` doubles as "this came from the glossary" — ItemDescription only shows a tooltip when it's
            // set, which a plain (non-glossary) [img] icon part never has. Falls back to the configured phrase
            // (not the matched text's own casing) when the entry has no note of its own, matching the entry's
            // canonical spelling regardless of how the source text happened to capitalize it.
            const note = entry.note?.trim() || phrase;
            pieces.push(
                entry.icon
                    ? { kind: "icon", src: glossaryIconSrc(entry.icon), width: DEFAULT_ICON_WIDTH, alt: phrase, note }
                    : { kind: "emoji", value: entry.emoji!, note }
            );

            lastIndex = index + match[0].length;
        }
        if (lastIndex < part.value.length) pieces.push({ kind: "text", value: part.value.slice(lastIndex) });

        return pieces;
    });
}

/** Everything needed to resolve `{item:ID}`/`{tag:Name}`/`{glossary:ID}` tokens (see applyIconTokens) — bundled
 *  into one object so parseItemDescription's own parameter list doesn't keep growing per new token kind. */
export interface IconTokenContext {
    items: Item[];
    itemIcons: Record<string, string>;
    tagIcons: TagIcon[];
    /** Every glossary entry, unfiltered by descriptionMode/enabled — `{glossary:ID}` is a deliberate direct
     *  insertion (like `{item:ID}`/`{tag:Name}`), not a phrase match, so it always resolves regardless of
     *  whether that entry's own checkbox is on. */
    glossary: GlossaryEntry[];
}

// `{item:ID}`, `{tag:Name}`, `{glossary:ID}` — deliberately distinct syntax from PLACEHOLDER_RE ({Word}, no colon
// allowed) so there's no ambiguity; inserted by ItemDetailPage's "Вставить значок" picker instead of the editor
// needing to hand-type a real res://.../file.png path or hope a glossary phrase happens to appear verbatim.
const ICON_TOKEN_RE = /\{item:([A-Za-z0-9_]+)\}|\{tag:([^}]+)\}|\{glossary:([^}]+)\}/g;

/** icon (wins) or emoji for a glossary entry, or undefined if it has neither — shared by the render-side token
 *  resolution below and by GlossaryPage's own preview, so "what does this entry look like" has one definition. */
function glossaryEntryIconOrEmoji(entry: GlossaryEntry): { kind: "icon"; src: string } | { kind: "emoji"; value: string } | undefined {
    if (entry.icon) return { kind: "icon", src: glossaryIconSrc(entry.icon) };
    if (entry.emoji) return { kind: "emoji", value: entry.emoji };
    return undefined;
}

/**
 * Resolves `{item:ID}` (an item's own icon — manual emoji override wins, else its real sprite, else the 🧩
 * placeholder, same priority as the ItemIcon component), `{tag:Name}` (looked up in the curated TagIcon list,
 * GlossaryPage's "Иконки тегов" tab), and `{glossary:ID}` (a specific glossary entry's icon/emoji, inserted
 * directly rather than relying on its phrase appearing in the text) into icon/emoji parts. A token naming
 * something that doesn't exist (or a glossary entry with neither icon nor emoji set) is left as literal text —
 * visible so a stale/typo'd reference is obvious rather than silently vanishing, same philosophy as an
 * unrecognized `res://` prefix elsewhere in this file.
 */
function applyIconTokens(parts: DescriptionPart[], context: IconTokenContext): DescriptionPart[] {
    const itemsById = new Map(context.items.map((item) => [item.id, item]));
    const tagIconByName = new Map(context.tagIcons.map((entry) => [entry.tag.trim().toLowerCase(), entry]));
    const glossaryById = new Map(context.glossary.map((entry) => [entry.id, entry]));

    return parts.flatMap((part): DescriptionPart[] => {
        if (part.kind !== "text") return [part];

        const pieces: DescriptionPart[] = [];
        let lastIndex = 0;
        for (const match of part.value.matchAll(ICON_TOKEN_RE)) {
            const [fullMatch, itemId, tagName, glossaryId] = match;
            const index = match.index ?? 0;
            if (index > lastIndex) pieces.push({ kind: "text", value: part.value.slice(lastIndex, index) });

            if (itemId !== undefined) {
                const refItem = itemsById.get(itemId);
                const manualIcon = refItem ? context.itemIcons[itemId] : undefined;
                const spritePath = refItem ? getItemSpritePath(refItem) : undefined;

                if (manualIcon) {
                    pieces.push({ kind: "emoji", value: manualIcon });
                } else if (spritePath) {
                    pieces.push({ kind: "icon", src: spritePath, width: DEFAULT_ICON_WIDTH, alt: itemId });
                } else if (refItem) {
                    pieces.push({ kind: "emoji", value: "🧩" });
                } else {
                    pieces.push({ kind: "text", value: fullMatch });
                }
            } else if (tagName !== undefined) {
                const entry = tagIconByName.get(tagName.trim().toLowerCase());
                pieces.push(
                    entry?.icon
                        ? { kind: "icon", src: glossaryIconSrc(entry.icon), width: DEFAULT_ICON_WIDTH, alt: entry.tag }
                        : { kind: "text", value: fullMatch }
                );
            } else if (glossaryId !== undefined) {
                const entry = glossaryById.get(glossaryId);
                const resolved = entry ? glossaryEntryIconOrEmoji(entry) : undefined;
                const note = entry?.note?.trim() || entry?.phrases[0];
                if (resolved?.kind === "icon") {
                    pieces.push({ kind: "icon", src: resolved.src, width: DEFAULT_ICON_WIDTH, alt: note ?? "", note });
                } else if (resolved?.kind === "emoji") {
                    pieces.push({ kind: "emoji", value: resolved.value, note });
                } else {
                    pieces.push({ kind: "text", value: fullMatch });
                }
            }

            lastIndex = index + fullMatch.length;
        }
        if (lastIndex < part.value.length) pieces.push({ kind: "text", value: part.value.slice(lastIndex) });

        return pieces;
    });
}

/**
 * Resolves {ValueOrRange}/{ValueOrRange2}/raw-column/mechanic-field placeholders, then splits [img] and
 * [color=#...] BBCode into renderable parts. `mechanics` is the full loaded list — only this item's own rows
 * are used (first one, per the user). `glossary` drives the extra phrase-substitution pass — pass `[]` (the
 * default) to skip it entirely (the "text" mode never calls this at all; ItemDescription.tsx decides which
 * subset of the glossary to pass based on the "text-icons"/"icons-emoji" mode and each entry's enabled flag).
 * `iconTokens`, if given, additionally resolves `{item:ID}`/`{tag:Name}` tokens — omit it (e.g. in tests that
 * don't care about this feature) to leave those tokens as literal text.
 */
export function parseItemDescription(
    item: Item,
    rawDescription: string,
    mechanics: MechanicRow[],
    glossary: GlossaryEntry[] = [],
    iconTokens?: IconTokenContext
): DescriptionPart[] {
    const firstMechanic = mechanics.find((mechanic) => mechanic.itemId === item.id);
    const substituted = substitutePlaceholders(rawDescription, item, firstMechanic);
    let parts = parseColorAndImageTags(substituted, item);
    if (iconTokens) parts = applyIconTokens(parts, iconTokens);
    return glossary.length > 0 ? applyGlossary(parts, glossary) : parts;
}
