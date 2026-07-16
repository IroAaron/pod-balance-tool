import type { ParsedTable } from "./types";
import type { ClassifiedTable } from "./tableClassifier";
import type { Item } from "../models/Item";
import type { Translation } from "../models/Translation";
import type { MechanicRow, MechanicTableName } from "../models/Mechanic";
import type { UpgradeChain } from "../models/UpgradeChain";

export interface NormalizedData {
    items: Item[];

    translations: Translation[];

    mechanics: MechanicRow[];

    upgradeChains: UpgradeChain[];
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

/** Fallback for real sheets whose columns don't match the documented names exactly. */
function findColumnContaining(headers: string[], substrings: string[]): string | undefined {
    const normalized = headers.map((header) => header.trim().toLowerCase());
    for (const substring of substrings) {
        const index = normalized.findIndex((header) => header.includes(substring));
        if (index !== -1) return headers[index];
    }
    return undefined;
}

function normalizeItemsTable(table: ParsedTable): Item[] {
    const idColumn = findColumn(table.headers, ["ItemId", "Id"]);
    if (!idColumn) return [];

    const tagsColumn = findColumn(table.headers, ["ItemTag", "Tags"]) ?? findColumnContaining(table.headers, ["tag"]);
    const typeColumn = findColumn(table.headers, ["ItemType", "Type"]) ?? findColumnContaining(table.headers, ["type"]);
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
    // "value" (legacy key/value sheets) takes priority; real sheets use per-language columns.
    const valueColumn = findColumn(table.headers, ["value", "ru", "en"]);
    if (!keyColumn || !valueColumn) return [];

    return table.rows
        .filter((row) => (row[keyColumn] ?? "").trim() !== "")
        .map((row) => ({
            key: row[keyColumn].trim(),
            value: row[valueColumn] ?? "",
        }));
}

function normalizeUpgradeChainsTable(table: ParsedTable): UpgradeChain[] {
    const chainIdColumn = findColumn(table.headers, ["UpgradeChainId"]);
    if (!chainIdColumn) return [];

    const tierColumns = table.headers
        .filter((header) => /^UpgradeId\d+$/i.test(header.trim()))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
            const numB = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
            return numA - numB;
        });

    return table.rows
        .filter((row) => (row[chainIdColumn] ?? "").trim() !== "")
        .map((row): UpgradeChain => ({
            id: row[chainIdColumn].trim(),
            itemIds: tierColumns
                .map((column) => row[column]?.trim())
                .filter((id): id is string => Boolean(id)),
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
    const upgradeChains: UpgradeChain[] = [];
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
                    message: "Не найдены колонки key/value(ru/en) — таблица переводов пропущена",
                });
            }
            translations.push(...normalized);
        } else if (type === "UpgradeChains") {
            const normalized = normalizeUpgradeChainsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдена колонка UpgradeChainId — таблица цепочек прокачки пропущена",
                });
            }
            upgradeChains.push(...normalized);
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

    return { data: { items, translations, mechanics, upgradeChains }, warnings };
}
