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

export const MECHANIC_LABELS: Record<MechanicKind, string> = {
    MechActivate: "Активация",
    MechAddValue: "Изменение значения",
    MechChangeColor: "Смена цвета",
    MechAddItem: "Спавн/замена предмета",
    MechAddTag: "Выдача тега",
};

/** A reference "point" on a mechanic node that can connect out to an Item node. */
export interface MechanicRefPoint {
    key: string;

    label: string;

    /** Column this reference represents when the mechanic is eventually serialized (informational only in this lab). */
    field: string;
}

/** Reference points (handles), keyed by mechanic kind — every mechanic also gets an implicit "activator" input point. */
export const MECHANIC_REF_POINTS: Record<MechanicKind, MechanicRefPoint[]> = {
    MechActivate: [{ key: "target", label: "Цель", field: "UseTargetIds" }],
    MechAddValue: [{ key: "target", label: "Цель", field: "UseTargetIds" }],
    MechChangeColor: [],
    MechAddItem: [
        { key: "target", label: "Куда поставить", field: "TargetItemId" },
        { key: "newItem", label: "Новый предмет", field: "NewItemId" },
    ],
    MechAddTag: [{ key: "target", label: "Кому дать тег", field: "TargetItemId" }],
};

const ID_REFERENCE_FIELDS = new Set(["UseActivatorIds", "UseTargetIds", "TargetItemId", "NewItemId", "ItemId"]);

/** Scalar (non-item-reference) columns shown as plain inputs on the mechanic node body. */
export const MECHANIC_SCALAR_FIELDS: Record<MechanicKind, string[]> = Object.fromEntries(
    MECHANIC_KINDS.map((kind) => [kind, MECHANIC_TABLE_COLUMNS[kind].filter((col) => !ID_REFERENCE_FIELDS.has(col))]),
) as Record<MechanicKind, string[]>;
