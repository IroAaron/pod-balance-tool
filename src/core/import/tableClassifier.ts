import type { ParsedTable } from "./types";
import type { MechanicTableName } from "../models/Mechanic";
import { KNOWN_MECHANIC_TABLES, MECHANIC_TABLE_SIGNATURE_COLUMNS } from "../domain/mechanicTables";

export type TableType = MechanicTableName | "Items" | "Translations";

export interface ClassifiedTable {
    type: TableType;

    table: ParsedTable;
}

function normalizeHeader(header: string): string {
    return header.trim().toLowerCase();
}

function hasColumn(headers: string[], name: string): boolean {
    const normalized = headers.map(normalizeHeader);
    return normalized.includes(name.toLowerCase());
}

function hasAllColumns(headers: string[], names: string[]): boolean {
    return names.every((name) => hasColumn(headers, name));
}

function findIdColumn(headers: string[]): string | undefined {
    return headers.find((header) => {
        const normalized = normalizeHeader(header);
        return normalized === "itemid" || normalized === "id";
    });
}

export function classifyTable(table: ParsedTable): ClassifiedTable {
    const { headers, sourceName } = table;

    const nameHint = KNOWN_MECHANIC_TABLES.find(
        (name) => name.toLowerCase() === sourceName.trim().toLowerCase()
    );

    if (hasAllColumns(headers, ["key", "value"]) && headers.length <= 3) {
        return { type: "Translations", table };
    }

    const idColumn = findIdColumn(headers);

    if (idColumn) {
        for (const name of KNOWN_MECHANIC_TABLES) {
            const signature = MECHANIC_TABLE_SIGNATURE_COLUMNS[name];
            if (signature.length > 0 && hasAllColumns(headers, signature)) {
                return { type: name, table };
            }
        }

        if (nameHint) {
            return { type: nameHint, table };
        }

        return { type: "Items", table };
    }

    if (nameHint) {
        return { type: nameHint, table };
    }

    return { type: "Unknown", table };
}
