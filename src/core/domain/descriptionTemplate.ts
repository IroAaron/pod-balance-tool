import type { Item } from "../models/Item";
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

function substitutePlaceholders(text: string, item: Item): string {
    return text.replace(PLACEHOLDER_RE, (match, field: string) => {
        if (field === "ValueOrRange") return formatValueOrRange(item);
        if (field === "ValueOrRange2") return formatValueOrRange2(item);
        // Generic fallback for any other {ColumnName} reference (e.g. {MoneyValue}) — same
        // "pull from data, don't hardcode dimension names" rule the rest of this app follows.
        return findRawValue(item.raw, field) ?? match;
    });
}

const IMG_TAG_RE = /\[img(?:\s+width=(\d+))?\]([\s\S]*?)\[\/img\]/gi;

export type DescriptionPart =
    | { kind: "text"; value: string }
    | { kind: "icon"; src: string; width: number; alt: string };

const DEFAULT_ICON_WIDTH = 24;

/** Resolves {ValueOrRange}/{ValueOrRange2}/raw-column placeholders, then splits [img]/res:// BBCode into renderable parts. */
export function parseItemDescription(item: Item, rawDescription: string): DescriptionPart[] {
    const substituted = substitutePlaceholders(rawDescription, item);

    const parts: DescriptionPart[] = [];
    let lastIndex = 0;

    for (const match of substituted.matchAll(IMG_TAG_RE)) {
        const [fullMatch, widthStr, resPath] = match;
        const index = match.index ?? 0;

        if (index > lastIndex) parts.push({ kind: "text", value: substituted.slice(lastIndex, index) });

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

        lastIndex = index + fullMatch.length;
    }

    if (lastIndex < substituted.length) parts.push({ kind: "text", value: substituted.slice(lastIndex) });

    return parts;
}
