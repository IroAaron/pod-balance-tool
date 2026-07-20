import type { Item } from "../models/Item";
import type { MechanicRow } from "../models/Mechanic";
import { SPRITE_BASE_PATH, findRawValue } from "./sprites";

/** Synced from the game repo's `roulette_interface/Icons_tags/` on every deploy — see .github/workflows/deploy.yml. */
export const TAG_ICON_BASE_PATH = `${import.meta.env.BASE_URL}icons-tags/`;

/**
 * Descriptions embed images as Godot resource paths (`res://roulette_interface/<folder>/<file>.png`), matching
 * whatever the game's own BBCode renderer expects. Only these two folders are synced into `public/` — an
 * unrecognized prefix falls through to the raw BBCode tag in parseItemDescription rather than a broken <img>.
 */
const RES_PATH_PREFIXES: Array<{ prefix: string; base: string }> = [
    { prefix: "res://roulette_interface/pod-mini characters/", base: SPRITE_BASE_PATH },
    { prefix: "res://roulette_interface/Icons_tags/", base: TAG_ICON_BASE_PATH },
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
    | { kind: "icon"; src: string; width: number; alt: string }
    | { kind: "colored-text"; value: string; colors: string[] };

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

/**
 * Resolves {ValueOrRange}/{ValueOrRange2}/raw-column/mechanic-field placeholders, then splits [img] and
 * [color=#...] BBCode into renderable parts. `mechanics` is the full loaded list — only this item's own rows
 * are used (first one, per the user).
 */
export function parseItemDescription(item: Item, rawDescription: string, mechanics: MechanicRow[]): DescriptionPart[] {
    const firstMechanic = mechanics.find((mechanic) => mechanic.itemId === item.id);
    const substituted = substitutePlaceholders(rawDescription, item, firstMechanic);
    return parseColorAndImageTags(substituted, item);
}
