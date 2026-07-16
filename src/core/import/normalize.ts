import type { ParsedTable } from "./types";
import type { ClassifiedTable } from "./tableClassifier";
import type { Item } from "../models/Item";
import type { Translation } from "../models/Translation";
import type { MechanicRow, MechanicTableName } from "../models/Mechanic";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { ReplaceRule, ReplaceRuleSource } from "../models/ReplaceRule";
import { tableNameOf } from "./tableNames";

export interface NormalizedData {
    items: Item[];

    translations: Translation[];

    mechanics: MechanicRow[];

    upgradeChains: UpgradeChain[];

    replaceRules: ReplaceRule[];

    /** Valid values per parameter dimension, as curated in the Enums sheet. */
    enumValues: Record<string, string[]>;
}

export interface ImportWarning {
    sourceName: string;

    message: string;
}

/** These tables have no ItemType column at all — the category is implicit in which table a row came from. */
const ITEM_CATEGORY_HINTS: Record<string, string> = {
    cards: "Card",
    houses: "House",
    artefacts: "Artefact",
};

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
    // Exact match only — "type" as a substring also matches ValueUsageType/BonusCountingType/etc,
    // which are different dimensions entirely, not the item's own category.
    const typeColumn = findColumn(table.headers, ["ItemType", "Type"]);
    const nameKeyColumn = findColumn(table.headers, ["NameKey", "Name"]);
    const descKeyColumn = findColumn(table.headers, ["DescKey", "DescriptionKey", "Description"]);
    const categoryHint = ITEM_CATEGORY_HINTS[tableNameOf(table.sourceName)];

    return table.rows
        .filter((row) => (row[idColumn] ?? "").trim() !== "")
        .map((row): Item => {
            const id = row[idColumn].trim();
            return {
                id,
                tags: tagsColumn ? splitList(row[tagsColumn] ?? "") : [],
                itemType: (typeColumn ? row[typeColumn]?.trim() : "") || categoryHint,
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

function normalizeReplaceRuleTable(table: ParsedTable, source: ReplaceRuleSource): ReplaceRule[] {
    const fromColumn = findColumn(table.headers, ["ItemIdToReplace"]);
    const toColumn = findColumn(table.headers, ["ReplacementItem"]);
    if (!fromColumn || !toColumn) return [];

    return table.rows
        .filter((row) => (row[fromColumn] ?? "").trim() !== "" && (row[toColumn] ?? "").trim() !== "")
        .map((row, index): ReplaceRule => {
            const fields: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
                if (key === fromColumn || key === toColumn) continue;
                if (value !== undefined && value !== "") fields[key] = value;
            }

            return {
                id: `${source}:${row[fromColumn].trim()}:${index}`,
                source,
                itemIdToReplace: row[fromColumn].trim(),
                replacementItem: row[toColumn].trim(),
                fields,
            };
        });
}

/**
 * The Enums sheet lists valid values per parameter dimension as independent,
 * ragged columns (one column per dimension, N unrelated values stacked down
 * it) — not a normal row-per-record table. Columns with no header (used for
 * human-readable labels alongside another column) are skipped.
 */
function normalizeEnumsTable(table: ParsedTable): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const header of table.headers) {
        const dimension = header.trim();
        if (!dimension) continue;

        const values = new Set<string>();
        for (const row of table.rows) {
            const value = row[header]?.trim();
            if (value) values.add(value);
        }

        if (values.size > 0) result[dimension] = [...values].sort();
    }

    return result;
}

function mergeEnumValues(target: Record<string, string[]>, incoming: Record<string, string[]>): void {
    for (const [dimension, values] of Object.entries(incoming)) {
        const set = new Set([...(target[dimension] ?? []), ...values]);
        target[dimension] = [...set].sort();
    }
}

export function normalizeClassifiedTables(classified: ClassifiedTable[]): {
    data: NormalizedData;
    warnings: ImportWarning[];
} {
    const items: Item[] = [];
    const translations: Translation[] = [];
    const mechanics: MechanicRow[] = [];
    const upgradeChains: UpgradeChain[] = [];
    const replaceRules: ReplaceRule[] = [];
    const enumValues: Record<string, string[]> = {};
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
        } else if (type === "ReplaceItem" || type === "ReplaceOnTrigger") {
            const normalized = normalizeReplaceRuleTable(table, type);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдены колонки ItemIdToReplace/ReplacementItem — таблица замен пропущена",
                });
            }
            replaceRules.push(...normalized);
        } else if (type === "Enums") {
            mergeEnumValues(enumValues, normalizeEnumsTable(table));
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

    return {
        data: { items, translations, mechanics, upgradeChains, replaceRules, enumValues },
        warnings,
    };
}
