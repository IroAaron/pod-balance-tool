import type { ParsedTable } from "./types";
import type { MechanicTableName } from "../models/Mechanic";
import { KNOWN_MECHANIC_TABLES, MECHANIC_TABLE_SIGNATURE_COLUMNS } from "../domain/mechanicTables";
import { matchesTableName } from "./tableNames";

export type TableType =
    | MechanicTableName
    | "Items"
    | "Translations"
    | "UpgradeChains"
    | "RoundSettings"
    | "Decks"
    | "DecksShop"
    | "Packs"
    | "Balls"
    | "Enums"
    | "ReplaceItem"
    | "ReplaceOnTrigger";

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

function hasColumnContaining(headers: string[], substrings: string[]): boolean {
    const normalized = headers.map(normalizeHeader);
    return normalized.some((header) => substrings.some((substring) => header.includes(substring)));
}

function findIdColumn(headers: string[]): string | undefined {
    return headers.find((header) => {
        const normalized = normalizeHeader(header);
        return normalized === "itemid" || normalized === "id";
    });
}

export function classifyTable(table: ParsedTable): ClassifiedTable {
    const { headers, sourceName } = table;

    const nameHint = KNOWN_MECHANIC_TABLES.find((name) => matchesTableName(sourceName, name));

    // key|value (legacy) or key|ru|en (real translation sheets) — pick by value column priority in normalize.ts.
    if (hasColumn(headers, "key") && (hasColumn(headers, "value") || hasColumn(headers, "ru")) && headers.length <= 4) {
        return { type: "Translations", table };
    }

    if (hasColumn(headers, "UpgradeChainId")) {
        return { type: "UpgradeChains", table };
    }

    // RoundId doesn't match findIdColumn's exact "id"/"itemid" check below, so this needs its own branch —
    // otherwise a real RoundSettings sheet falls straight through to Unknown.
    if (hasColumn(headers, "RoundId")) {
        return { type: "RoundSettings", table };
    }

    // Decks and DecksShop share identical columns (DeckId,Item,Weight,Cost) — same as Cards/Houses/Artefacts,
    // they can only be told apart by the sheet's own tab name, not column shape.
    if (hasColumn(headers, "DeckId")) {
        return matchesTableName(sourceName, "DecksShop") ? { type: "DecksShop", table } : { type: "Decks", table };
    }

    // PackId doesn't match findIdColumn's exact "id"/"itemid" check below either — own branch, same reasoning.
    if (hasColumn(headers, "PackId")) {
        return { type: "Packs", table };
    }

    // Balls' id column is "ItemId" (matches findIdColumn below) and it has a "MetaTag" column (contains "tag") —
    // without this early signature check, it would fall into the generic idColumn branch below and get
    // misclassified as "Items" by the tag/type fallback heuristic. Checked by its own distinctive columns, not name.
    if (hasAllColumns(headers, ["RunMin", "RunMax", "InertiaMin", "InertiaMax"])) {
        return { type: "Balls", table };
    }

    // A per-column, ragged list of valid enum values for each parameter dimension — not a row-per-record table.
    if (hasAllColumns(headers, ["ItemType", "TargetColor", "Place", "ActivatorType", "ItemTag"])) {
        return { type: "Enums", table };
    }

    if (hasAllColumns(headers, ["ItemIdToReplace", "ReplacementItem"])) {
        if (hasColumn(headers, "OnballStop") || hasColumn(headers, "ReplacementItemsTagForName")) {
            return { type: "ReplaceOnTrigger", table };
        }
        return { type: "ReplaceItem", table };
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

        // A bare Id column isn't enough — plenty of unrelated config tables (upgrade
        // chains, corridor cells, UI buttons...) have one too. Only treat it as the
        // real Items table if it also carries tag/type-shaped data.
        if (hasColumnContaining(headers, ["tag", "type"])) {
            return { type: "Items", table };
        }

        return { type: "Unknown", table };
    }

    if (nameHint) {
        return { type: nameHint, table };
    }

    return { type: "Unknown", table };
}
