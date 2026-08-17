import type { Item } from "../../../core/models/Item";
import type { Pack } from "../../../core/models/Pack";

/**
 * Same technique as roundAsItemStub — Pack descriptions live in the same item_desc table and use the same
 * authoring conventions (icon tokens, [img]/[color], glossary phrases), so rather than widen ItemDescription's
 * signature for this one new caller, build a minimal Item-shaped stub. Pack has no `raw` column bag (its config
 * fields are structured, not a CSV row passthrough) — an empty object is fine, it only affects unused
 * {FieldName}-style placeholder resolution.
 */
export function packAsItemStub(pack: Pack): Item {
    return {
        id: pack.id,
        tags: [],
        itemType: "",
        nameKey: pack.nameKey,
        descKey: pack.descKey,
        valueMin: undefined,
        valueMax: undefined,
        raw: {},
    };
}
