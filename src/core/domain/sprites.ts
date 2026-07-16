import type { Item } from "../models/Item";

/** Vite serves everything under public/ as static files from the site root. */
export const SPRITE_BASE_PATH = "/pod-mini-characters/";

function findRawValue(raw: Record<string, string>, columnName: string): string | undefined {
    const key = Object.keys(raw).find((entry) => entry.trim().toLowerCase() === columnName.toLowerCase());
    const value = key ? raw[key] : undefined;
    return value?.trim() || undefined;
}

/** The raw sprite filename from the Cards/Houses "CardSpriteNameMini" column — undefined if the item has none. */
export function getItemSpriteFileName(item: Item): string | undefined {
    return findRawValue(item.raw, "CardSpriteNameMini");
}

/** Full path to a chel's mini sprite, ready to use as an <img src> — undefined if the item has none. */
export function getItemSpritePath(item: Item): string | undefined {
    const spriteName = getItemSpriteFileName(item);
    if (!spriteName) return undefined;
    return `${SPRITE_BASE_PATH}${encodeURIComponent(spriteName)}`;
}
