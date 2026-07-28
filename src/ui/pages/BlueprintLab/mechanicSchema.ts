import { MECHANIC_TABLE_COLUMNS } from "../../../core/domain/mechanicTables";
import type { MechanicTableName } from "../../../core/models/Mechanic";

export type MechanicKind = Exclude<MechanicTableName, "Unknown">;

export const MECHANIC_KINDS: MechanicKind[] = [
    "MechActivate",
    "MechAddValue",
    "MechChangeColor",
    "MechAddItem",
    "MechAddTag",
];

/** A block groups one mechanic's related columns (e.g. all Activator* fields) behind a single canvas point. */
export type BlockKind = "activator" | "target" | "bonus" | "newColor" | "newItem" | "newTag";

export interface BlockDefinition {
    kind: BlockKind;

    /** Raw column name offered first when the block is created (the point's drag-to-create prompt). */
    primaryField: string;

    /** Remaining raw column names, edited as plain fields once the block node exists. */
    otherFields: string[];

    /** Raw column name that is a literal item-id reference, if this block has one — becomes an "attach item" point. */
    itemRefField?: string;

    /** Which side of the mechanic node the block's point renders on. */
    side: "left" | "right";
}

const ACTIVATOR_BLOCK: BlockDefinition = {
    kind: "activator",
    primaryField: "ActivatorType",
    otherFields: ["UseActivatorIds", "ActivatorTargetType", "ActivatorPlace", "ActivatorColor", "ActivatorTag", "ActivatorValueUsageType"],
    side: "left",
};

/**
 * Every mechanic table's Target* fields line up the same way except the item-id column name, which varies by
 * table (UseTargetIds vs TargetItemId) — rendered as a plain in-node field (see PLAIN_ITEM_REF_FIELDS), not its
 * own point, same as Activator's UseActivatorIds.
 */
function targetBlock(otherFields: string[], itemIdField?: string): BlockDefinition {
    return {
        kind: "target",
        primaryField: "TargetType",
        otherFields: itemIdField ? [itemIdField, ...otherFields] : otherFields,
        side: "right",
    };
}

export const MECHANIC_BLOCKS: Record<MechanicKind, BlockDefinition[]> = {
    MechActivate: [
        ACTIVATOR_BLOCK,
        targetBlock(["TargetPlace", "TargetColor", "TargetTag", "TargetValueUsageType", "TargetCount"], "UseTargetIds"),
    ],
    MechAddValue: [
        ACTIVATOR_BLOCK,
        targetBlock(
            ["TargetValueType", "TargetPlace", "TargetColor", "TargetTag", "TargetValueUsageType", "TargetCount", "TargetGetter"],
            "UseTargetIds",
        ),
        {
            kind: "bonus",
            primaryField: "BonusCountingType",
            otherFields: ["BonusUsageType", "BonusValueUsageType", "BonusTargetType", "BonusTargetPlace", "BonusTargetColor", "BonusTargetTag"],
            side: "right",
        },
    ],
    MechChangeColor: [
        ACTIVATOR_BLOCK,
        targetBlock(["TargetPlace", "TargetColor", "TargetTag", "TargetValueUsageType", "TargetCount"]),
        { kind: "newColor", primaryField: "NewColor", otherFields: [], side: "right" },
    ],
    MechAddItem: [
        ACTIVATOR_BLOCK,
        targetBlock(["TargetPlace", "TargetColor", "TargetTag", "TargetValueUsageType", "TargetCount"], "TargetItemId"),
        {
            kind: "newItem",
            primaryField: "ItemMech",
            otherFields: ["CopiedTargetType", "CopiedTargetPlace", "CopiedTargetColor", "CopiedTargetTag", "CopiedTargetValueUsageType"],
            itemRefField: "NewItemId",
            side: "right",
        },
    ],
    MechAddTag: [
        ACTIVATOR_BLOCK,
        targetBlock(["TargetPlace", "TargetColor", "TargetTag", "TargetValueUsageType", "TargetCount"], "TargetItemId"),
        { kind: "newTag", primaryField: "TagMech", otherFields: ["NewTags", "TagsCount"], side: "right" },
    ],
};

const BLOCK_LABELS: Record<BlockKind, string> = {
    activator: "Activator",
    target: "Target",
    bonus: "Bonus",
    newColor: "NewColor",
    newItem: "NewItem",
    newTag: "NewTag",
};

export function blockLabel(kind: BlockKind): string {
    return BLOCK_LABELS[kind];
}

/** Item-id-reference columns that render as a plain in-node field (searchable by name/id) rather than their own point. */
export const PLAIN_ITEM_REF_FIELDS = new Set<string>(["UseActivatorIds", "UseTargetIds", "TargetItemId"]);

/** Columns left over once ItemId + every block's own fields are removed — shown as plain fields on the mechanic node itself. */
export const MECHANIC_MISC_FIELDS: Record<MechanicKind, string[]> = Object.fromEntries(
    MECHANIC_KINDS.map((kind) => {
        const claimed = new Set<string>(["ItemId"]);
        for (const block of MECHANIC_BLOCKS[kind]) {
            claimed.add(block.primaryField);
            for (const f of block.otherFields) claimed.add(f);
            if (block.itemRefField) claimed.add(block.itemRefField);
        }
        return [kind, MECHANIC_TABLE_COLUMNS[kind].filter((col) => !claimed.has(col))];
    }),
) as Record<MechanicKind, string[]>;
