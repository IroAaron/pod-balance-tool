import type { Item } from "../../../core/models/Item";
import type { Round } from "../../../core/models/Round";

/**
 * `ItemDescription`/`parseItemDescription` are typed around a full `Item` (used for `item.raw`-based placeholder
 * substitution, `valueMin`/`valueMax`, and item-id-keyed mechanic lookup) since every other consumer is a real
 * item. Round descriptions live in the same `item_desc` table and use the same authoring conventions (icon
 * tokens, [img]/[color], glossary phrases), so rather than widen that shared component's signature for this one
 * new caller, build a minimal stub: valueMin/valueMax stay undefined (rounds have no such concept — any
 * {ValueOrRange}-style token simply won't resolve, which is correct) and no mechanic will match round.id (no
 * {MoneyValue}-type substitution fires, also correct — rounds have no mechanics of their own).
 */
export function roundAsItemStub(round: Round): Item {
    return {
        id: round.id,
        tags: [],
        itemType: "",
        nameKey: round.id,
        descKey: round.descKey,
        valueMin: undefined,
        valueMax: undefined,
        raw: round.raw,
    };
}
