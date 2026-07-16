import type { Item } from "../models/Item";
import type { MechanicRow } from "../models/Mechanic";

/**
 * Which mechanic field columns feed each logical "parameter dimension".
 * These are field *names* from the design doc (structural), not the
 * dimension's allowed values — the values themselves are always derived
 * from loaded data (or added as custom values by the user), never hardcoded.
 */
const DIMENSION_FIELD_KEYS: Record<string, string[]> = {
    ItemTag: ["ActivatorTag", "TargetTag", "BonusTargetTag"],
    ItemType: ["ItemType", "ActivatorTargetType", "TargetType", "BonusTargetType"],
    TargetColor: ["ActivatorColor", "TargetColor", "BonusTargetColor", "NewColor"],
    Place: ["ActivatorPlace", "TargetPlace", "BonusTargetPlace"],
    ActivatorType: ["ActivatorType"],
    ValueUsageType: ["ActivatorValueUsageType", "TargetValueUsageType", "BonusUsageType", "BonusValueUsageType"],
    BonusCountingType: ["BonusCountingType"],
    DurationType: ["DurationType"],
    ValueTypes: ["TargetValueType"],
};

function splitList(value: string): string[] {
    return value
        .split(/[|,;]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

/** Derives the live set of values per parameter dimension purely from loaded Items/Mechanics. */
export function deriveParamValues(items: Item[], mechanics: MechanicRow[]): Record<string, string[]> {
    const result: Record<string, Set<string>> = {
        ItemTag: new Set(items.flatMap((item) => item.tags)),
        ItemType: new Set(items.map((item) => item.itemType).filter((value): value is string => Boolean(value))),
    };

    for (const mechanic of mechanics) {
        for (const [dimension, keys] of Object.entries(DIMENSION_FIELD_KEYS)) {
            if (!result[dimension]) result[dimension] = new Set();
            for (const key of keys) {
                const value = mechanic.fields[key];
                if (value) splitList(value).forEach((entry) => result[dimension].add(entry));
            }
        }
    }

    return Object.fromEntries(Object.entries(result).map(([dimension, values]) => [dimension, [...values].sort()]));
}

/** Unions any number of dimension -> values sources (data-derived, curated Enums sheet, user-added custom). */
export function mergeParamValueSources(...sources: Record<string, string[]>[]): Record<string, string[]> {
    const merged: Record<string, Set<string>> = {};

    for (const source of sources) {
        for (const [dimension, values] of Object.entries(source)) {
            if (!merged[dimension]) merged[dimension] = new Set();
            values.forEach((value) => merged[dimension].add(value));
        }
    }

    return Object.fromEntries(Object.entries(merged).map(([dimension, values]) => [dimension, [...values].sort()]));
}
