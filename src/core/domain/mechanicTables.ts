import type { MechanicTableName } from "../models/Mechanic";

/**
 * Structural column layout per mechanic table, taken from the real production
 * spreadsheet (2026-07-16 export). These are field *names*, never enum
 * values — the actual allowed values for ActivatorType/TargetColor/etc. are
 * never hardcoded and are instead derived from whatever data gets imported
 * (see paramRegistry.ts).
 */
export const MECHANIC_TABLE_COLUMNS: Record<Exclude<MechanicTableName, "Unknown">, string[]> = {
    MechActivate: [
        "ItemId",
        "UseActivatorIds",
        "ActivatorType",
        "ActivatorTargetType",
        "ActivatorPlace",
        "ActivatorColor",
        "ActivatorTag",
        "ActivatorValueUsageType",
        "UseTargetIds",
        "TargetType",
        "TargetPlace",
        "TargetColor",
        "TargetTag",
        "TargetValueUsageType",
        "TargetCount",
        "ActivationCount",
        "MyPositionReq",
        "Chance",
    ],
    MechAddValue: [
        "ItemId",
        "UseActivatorIds",
        "ActivatorType",
        "ActivatorTargetType",
        "ActivatorPlace",
        "ActivatorColor",
        "ActivatorTag",
        "ActivatorValueUsageType",
        "UseTargetIds",
        "TargetType",
        "TargetValueType",
        "TargetPlace",
        "TargetColor",
        "TargetTag",
        "TargetValueUsageType",
        "TargetCount",
        "TargetGetter",
        "BonusCountingType",
        "BonusUsageType",
        "BonusValueUsageType",
        "BonusTargetType",
        "BonusTargetPlace",
        "BonusTargetColor",
        "BonusTargetTag",
        "DurationType",
        "Duration",
        "MyPositionReq",
        "Chance",
    ],
    MechChangeColor: [
        "ItemId",
        "UseActivatorIds",
        "ActivatorType",
        "ActivatorTargetType",
        "ActivatorPlace",
        "ActivatorColor",
        "ActivatorTag",
        "ActivatorValueUsageType",
        "TargetType",
        "TargetPlace",
        "TargetColor",
        "TargetTag",
        "TargetValueUsageType",
        "TargetCount",
        "NewColor",
    ],
    MechAddItem: [
        "ItemId",
        "UseActivatorIds",
        "ActivatorType",
        "ActivatorTargetType",
        "ActivatorPlace",
        "ActivatorColor",
        "ActivatorTag",
        "ActivatorValueUsageType",
        "TargetType",
        "TargetItemId",
        "TargetPlace",
        "TargetColor",
        "TargetTag",
        "TargetValueUsageType",
        "TargetCount",
        "ItemMech",
        "NewItemId",
        "CopiedTargetType",
        "CopiedTargetPlace",
        "CopiedTargetColor",
        "CopiedTargetTag",
        "CopiedTargetValueUsageType",
    ],
    MechAddTag: [
        "ItemId",
        "UseActivatorIds",
        "ActivatorType",
        "ActivatorTargetType",
        "ActivatorPlace",
        "ActivatorColor",
        "ActivatorTag",
        "ActivatorValueUsageType",
        "TargetType",
        "TargetItemId",
        "TargetPlace",
        "TargetColor",
        "TargetTag",
        "TargetValueUsageType",
        "TargetCount",
        "TagMech",
        "NewTags",
        "TagsCount",
    ],
};

/** Columns unique enough to that table to be used as a distinguishing signature. */
export const MECHANIC_TABLE_SIGNATURE_COLUMNS: Record<Exclude<MechanicTableName, "Unknown">, string[]> = {
    MechActivate: ["ActivationCount"],
    MechAddValue: ["BonusCountingType", "TargetValueType"],
    MechChangeColor: ["NewColor"],
    MechAddItem: ["NewItemId", "ItemMech"],
    MechAddTag: ["TagMech", "NewTags", "TagsCount"],
};

/**
 * Field names (across any mechanic table) that carry a tag value relevant to
 * an item — either a filter it reacts to (ActivatorTag/TargetTag/
 * BonusTargetTag) or a tag it hands out to something else (MechAddTag's
 * NewTags, e.g. "Гетто" giving Bums the Criminal tag). Either direction makes
 * the tag part of that item's own thematic footprint for clustering purposes.
 */
export const MECHANIC_TAG_FIELDS = ["ActivatorTag", "TargetTag", "BonusTargetTag", "NewTags"];

export const KNOWN_MECHANIC_TABLES = Object.keys(MECHANIC_TABLE_COLUMNS) as Exclude<MechanicTableName, "Unknown">[];
