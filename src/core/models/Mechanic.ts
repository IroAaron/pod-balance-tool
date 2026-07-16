export type MechanicTableName =
    | "MechActivate"
    | "MechAddValue"
    | "MechChangeColor"
    | "MechAddItem"
    | "MechAddTag"
    | "Unknown";

export interface MechanicRow {
    id: string;

    table: MechanicTableName | string;

    itemId: string;

    fields: Record<string, string>;
}
