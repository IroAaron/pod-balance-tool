import type { Item } from "../../../core/models/Item";
import type { Ball } from "../../../core/models/Ball";

/** Same technique as packAsItemStub/roundAsItemStub — Ball descriptions live in the same item_desc table and use
 *  the same authoring conventions, so a minimal Item-shaped stub lets them go through ItemDescription unchanged. */
export function ballAsItemStub(ball: Ball): Item {
    return {
        id: ball.id,
        tags: [],
        itemType: "",
        nameKey: ball.nameKey,
        descKey: ball.descKey,
        valueMin: undefined,
        valueMax: undefined,
        raw: {},
    };
}
