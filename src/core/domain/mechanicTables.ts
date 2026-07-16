import type { MechanicTableName } from "../models/Mechanic";

/**
 * Structural column layout per mechanic table, taken verbatim from the game
 * design doc. These are field *names*, never enum values — the actual
 * allowed values for ActivatorType/TargetColor/etc. are never hardcoded and
 * are instead derived from whatever data gets imported (see paramRegistry.ts).
 *
 * MechAddItem / MechAddTag have no finalized column list yet ("НУЖНО
 * ДОПИСАТЬ ФУНКЦИОНАЛ" in the source doc), so they're matched by table-name
 * hint only — any columns they do have still round-trip through
 * MechanicRow.fields untouched.
 */
export const MECHANIC_TABLE_COLUMNS: Record<Exclude<MechanicTableName, "Unknown">, string[]> = {
    MechActivate: [
        "ItemId",
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
    ],
    MechAddValue: [
        "ItemId",
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
    ],
    MechChangeColor: [
        "ItemId",
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
        "NewColor",
    ],
    MechAddItem: [],
    MechAddTag: [],
};

/** Columns unique enough to that table to be used as a distinguishing signature. */
export const MECHANIC_TABLE_SIGNATURE_COLUMNS: Record<Exclude<MechanicTableName, "Unknown">, string[]> = {
    MechActivate: ["ActivationCount"],
    MechAddValue: ["BonusCountingType", "TargetValueType"],
    MechChangeColor: ["NewColor"],
    MechAddItem: [],
    MechAddTag: [],
};

/** Field names (across any mechanic table) that carry a tag value used as a filter. */
export const MECHANIC_TAG_FIELDS = ["ActivatorTag", "TargetTag", "BonusTargetTag"];

/** Field names that may reference other items' ids directly. */
export const MECHANIC_ID_REFERENCE_FIELDS = ["UseTargetIds"];

export const KNOWN_MECHANIC_TABLES = Object.keys(MECHANIC_TABLE_COLUMNS) as Exclude<MechanicTableName, "Unknown">[];
