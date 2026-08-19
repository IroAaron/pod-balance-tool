import type { Item } from "../models/Item";

/**
 * "empty" — nothing at all in the description. "whitespace" — the cell holds only spaces, which reads as filled
 * in Google Sheets but renders as nothing on the site, so it's worth calling out separately rather than lumping
 * the two together: one is a gap nobody has got to yet, the other looks done and isn't.
 */
export type MissingDescriptionKind = "empty" | "whitespace";

export interface ItemWithoutDescription {
    item: Item;

    kind: MissingDescriptionKind;
}

/** Items whose description is missing or blank, in the order they were given. */
export function findItemsWithoutDescription(
    items: Item[],
    describe: (item: Item) => string
): ItemWithoutDescription[] {
    const found: ItemWithoutDescription[] = [];

    for (const item of items) {
        const description = describe(item);
        if (description.trim() !== "") continue;
        found.push({ item, kind: description === "" ? "empty" : "whitespace" });
    }

    return found;
}
