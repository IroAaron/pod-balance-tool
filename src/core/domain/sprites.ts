import type { Item } from "../models/Item";
import type { Build } from "../models/Build";

/**
 * Vite serves everything under public/ as static files from the site root — but "root" is `import.meta.env.BASE_URL`
 * (the configured `base`, e.g. "/pod-balance-tool/" on GitHub Pages), not always literally "/". A hardcoded
 * leading slash here 404s in production once `base` is set, even though it works fine in local dev where base is "/".
 */
export const SPRITE_BASE_PATH = `${import.meta.env.BASE_URL}pod-mini-characters/`;

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

export type ResolvedBuildIcon = { kind: "sprite"; path: string; fallback: string } | { kind: "emoji"; value: string };

/**
 * Same priority `BuildIcon`/`ItemIcon` use, pulled out as a plain function so canvas-based rendering (GraphPage's
 * force-graph nodes, which can't use React's `<img onError>` and has to manage its own Image() loading/caching)
 * stays in sync with the DOM version instead of re-deriving its own rules that could drift apart later: manual
 * build.icon override → root item's (build.items[0]) manual icon override → root item's real sprite → 🧩/🧠
 * placeholder emoji.
 */
export function resolveBuildIcon(
    build: Build,
    getItem: (id: string) => Item | undefined,
    getItemIcon: (itemId: string) => string | undefined
): ResolvedBuildIcon {
    if (build.icon) return { kind: "emoji", value: build.icon };

    const rootItem = build.items.length > 0 ? getItem(build.items[0]) : undefined;
    if (!rootItem) return { kind: "emoji", value: "🧠" };

    const customIcon = getItemIcon(rootItem.id);
    if (customIcon) return { kind: "emoji", value: customIcon };

    const spritePath = getItemSpritePath(rootItem);
    if (spritePath) return { kind: "sprite", path: spritePath, fallback: "🧩" };

    return { kind: "emoji", value: "🧩" };
}
