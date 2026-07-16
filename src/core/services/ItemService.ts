import type { Item } from "../models/Item";

export class ItemService {

    search(items: Item[], query: string): Item[] {

        return items.filter(item =>
            item.name.toLowerCase().includes(query.toLowerCase())
        );

    }

}