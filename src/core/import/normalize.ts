import type { ParsedTable } from "./types";
import type { ClassifiedTable } from "./tableClassifier";
import type { Item } from "../models/Item";
import type { Translation } from "../models/Translation";
import type { MechanicRow, MechanicTableName } from "../models/Mechanic";

export interface NormalizedData {
    items: Item[];

    translations: Translation[];

    mechanics: MechanicRow[];
}

export interface ImportWarning {
    sourceName: string;

    message: string;
}

function splitList(value: string): string[] {
    return value
        .split(/[|,;]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function findColumn(headers: string[], candidates: string[]): string | undefined {
    const normalized = headers.map((header) => header.trim().toLowerCase());
    for (const candidate of candidates) {
        const index = normalized.indexOf(candidate.toLowerCase());
        if (index !== -1) return headers[index];
    }
    return undefined;
}

function normalizeItemsTable(table: ParsedTable): Item[] {
    const idColumn = findColumn(table.headers, ["ItemId", "Id"]);
    if (!idColumn) return [];

    const tagsColumn = findColumn(table.headers, ["ItemTag", "Tags"]);
    const typeColumn = findColumn(table.headers, ["ItemType", "Type"]);
    const nameKeyColumn = findColumn(table.headers, ["NameKey", "Name"]);
    const descKeyColumn = findColumn(table.headers, ["DescKey", "DescriptionKey", "Description"]);

    return table.rows
        .filter((row) => (row[idColumn] ?? "").trim() !== "")
        .map((row): Item => {
            const id = row[idColumn].trim();
            return {
                id,
                tags: tagsColumn ? splitList(row[tagsColumn] ?? "") : [],
                itemType: typeColumn ? row[typeColumn]?.trim() || undefined : undefined,
                nameKey: (nameKeyColumn ? row[nameKeyColumn]?.trim() : "") || id,
                descKey: (descKeyColumn ? row[descKeyColumn]?.trim() : "") || `${id}_desc`,
                raw: row,
            };
        });
}

function normalizeTranslationsTable(table: ParsedTable): Translation[] {
    const keyColumn = findColumn(table.headers, ["key"]);
    const valueColumn = findColumn(table.headers, ["value"]);
    if (!keyColumn || !valueColumn) return [];

    return table.rows
        .filter((row) => (row[keyColumn] ?? "").trim() !== "")
        .map((row) => ({
            key: row[keyColumn].trim(),
            value: row[valueColumn] ?? "",
        }));
}

function normalizeMechanicTable(table: ParsedTable, type: MechanicTableName): MechanicRow[] {
    const idColumn = findColumn(table.headers, ["ItemId", "Id"]);
    if (!idColumn) return [];

    return table.rows
        .filter((row) => (row[idColumn] ?? "").trim() !== "")
        .map((row, index): MechanicRow => {
            const fields: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
                if (key === idColumn) continue;
                if (value !== undefined && value !== "") {
                    fields[key] = value;
                }
            }

            return {
                id: `${type}:${row[idColumn].trim()}:${index}`,
                table: type,
                itemId: row[idColumn].trim(),
                fields,
            };
        });
}

export function normalizeClassifiedTables(classified: ClassifiedTable[]): {
    data: NormalizedData;
    warnings: ImportWarning[];
} {
    const items: Item[] = [];
    const translations: Translation[] = [];
    const mechanics: MechanicRow[] = [];
    const warnings: ImportWarning[] = [];

    for (const { type, table } of classified) {
        if (type === "Items") {
            const normalized = normalizeItemsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдена колонка ItemId — таблица предметов пропущена",
                });
            }
            items.push(...normalized);
        } else if (type === "Translations") {
            const normalized = normalizeTranslationsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдены колонки key/value — таблица переводов пропущена",
                });
            }
            translations.push(...normalized);
        } else if (type === "Unknown") {
            warnings.push({
                sourceName: table.sourceName,
                message: "Не удалось определить тип таблицы — данные не загружены",
            });
        } else {
            const normalized = normalizeMechanicTable(table, type);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: `Таблица ${type}: не найдена колонка ItemId`,
                });
            }
            mechanics.push(...normalized);
        }
    }

    return { data: { items, translations, mechanics }, warnings };
}
