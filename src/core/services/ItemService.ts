import type { Item } from "../models/Item";

export type ItemSortKey = "name" | "id" | "tags" | "itemType" | "buildCount";

export type SortDirection = "asc" | "desc";

export interface ItemFilters {
    tags?: string[];

    itemType?: string;

    buildItemIds?: Set<string>;
}

export class ItemService {

    search(items: Item[], query: string, resolveName: (item: Item) => string = (item) => item.id): Item[] {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return items;

        return items.filter(
            (item) =>
                item.id.toLowerCase().includes(normalized) ||
                resolveName(item).toLowerCase().includes(normalized) ||
                item.tags.some((tag) => tag.toLowerCase().includes(normalized))
        );
    }

    filter(items: Item[], filters: ItemFilters): Item[] {
        return items.filter((item) => {
            if (filters.tags && filters.tags.length > 0 && !filters.tags.every((tag) => item.tags.includes(tag))) {
                return false;
            }
            if (filters.itemType && item.itemType !== filters.itemType) {
                return false;
            }
            if (filters.buildItemIds && !filters.buildItemIds.has(item.id)) {
                return false;
            }
            return true;
        });
    }

    sort(
        items: Item[],
        key: ItemSortKey,
        resolveName: (item: Item) => string = (item) => item.id,
        resolveBuildCount: (item: Item) => number = () => 0,
        direction: SortDirection = "asc"
    ): Item[] {
        const sorted = [...items];
        const sign = direction === "desc" ? -1 : 1;

        sorted.sort((a, b) => {
            switch (key) {
                case "name":
                    return sign * resolveName(a).localeCompare(resolveName(b));
                case "tags":
                    return sign * (a.tags[0] ?? "").localeCompare(b.tags[0] ?? "");
                case "itemType":
                    return sign * (a.itemType ?? "").localeCompare(b.itemType ?? "");
                // Ascending default — items in the fewest (or no) builds float to the top, pairing with the
                // Items page's "unused in any build" highlight instead of burying those items at the bottom;
                // "desc" flips that to surface the most-used items first instead.
                case "buildCount":
                    return sign * (resolveBuildCount(a) - resolveBuildCount(b) || resolveName(a).localeCompare(resolveName(b)));
                case "id":
                default:
                    return sign * a.id.localeCompare(b.id);
            }
        });

        return sorted;
    }

}
