import type { Item } from "../models/Item";

export type ItemSortKey = "name" | "id" | "tags" | "itemType";

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

    sort(items: Item[], key: ItemSortKey, resolveName: (item: Item) => string = (item) => item.id): Item[] {
        const sorted = [...items];

        sorted.sort((a, b) => {
            switch (key) {
                case "name":
                    return resolveName(a).localeCompare(resolveName(b));
                case "tags":
                    return (a.tags[0] ?? "").localeCompare(b.tags[0] ?? "");
                case "itemType":
                    return (a.itemType ?? "").localeCompare(b.itemType ?? "");
                case "id":
                default:
                    return a.id.localeCompare(b.id);
            }
        });

        return sorted;
    }

}
