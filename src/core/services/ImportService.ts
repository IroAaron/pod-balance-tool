import { fetchSourceTables } from "../import/sheetSource";
import { parseCsv } from "../import/csv";
import { sanitizeParsedTable } from "../import/sanitize";
import { classifyTable, type TableType } from "../import/tableClassifier";
import { normalizeClassifiedTables, type NormalizedData } from "../import/normalize";
import type { ParsedTable } from "../import/types";

export interface ImportReportTable {
    name: string;

    type: TableType;

    rowCount: number;
}

export interface ImportReport {
    tables: ImportReportTable[];

    warnings: string[];
}

export interface ImportResult {
    data: NormalizedData;

    report: ImportReport;
}

function buildResult(rawParsedTables: ParsedTable[]): ImportResult {
    // Classify on the raw table first (classification only reads headers, never values, so
    // sanitizing beforehand isn't needed for this) — then only sanitize non-Translations tables.
    // The prose-comment heuristic strips any 3+ word Cyrillic cell, which is exactly what a real
    // item name/description *is*; running it on Translations would silently blank every real
    // multi-word description while leaving short ones (accidentally) intact.
    const classified = rawParsedTables
        .map(classifyTable)
        .map((entry) =>
            entry.type === "Translations" ? entry : { type: entry.type, table: sanitizeParsedTable(entry.table) }
        );
    const { data, warnings } = normalizeClassifiedTables(classified);

    const tables: ImportReportTable[] = classified.map(({ type, table }) => ({
        name: table.sourceName,
        type,
        rowCount: table.rows.length,
    }));

    return {
        data,
        report: {
            tables,
            warnings: warnings.map((warning) => `${warning.sourceName}: ${warning.message}`),
        },
    };
}

export class ImportService {

    async importFromUrls(sources: { configUrl?: string; translationsUrl?: string }): Promise<ImportResult> {
        const parsedTables: ParsedTable[] = [];

        if (sources.configUrl) {
            parsedTables.push(...(await fetchSourceTables(sources.configUrl, "Config")));
        }

        if (sources.translationsUrl) {
            parsedTables.push(...(await fetchSourceTables(sources.translationsUrl, "Translations")));
        }

        return buildResult(parsedTables);
    }

    async importCsvFiles(files: File[]): Promise<ImportResult> {
        const parsedTables = await Promise.all(
            files.map(async (file) => {
                const text = await file.text();
                const sourceName = file.name.replace(/\.csv$/i, "");
                return parseCsv(text, sourceName);
            })
        );

        return buildResult(parsedTables);
    }

}
