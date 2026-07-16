import type { ParsedTable } from "./types";

const CYRILLIC_PATTERN = /[а-яё]/i;

/**
 * Several real sheets have a "column description" row right after the
 * header, written in Russian prose (e.g. "где должен быть сам итем чтобы
 * его механика могла сработать"). Left in, it gets imported as a bogus data
 * row/value. Genuine Cyrillic values that *do* belong in the data (e.g.
 * ItemMech = "поставить"/"удалить"/"дать") are always a single short word,
 * so word count is what separates the two — not "contains Cyrillic" alone.
 */
function isProseComment(value: string): boolean {
    if (!CYRILLIC_PATTERN.test(value)) return false;
    const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
    return wordCount > 2;
}

function sanitizeValue(value: string): string {
    return isProseComment(value) ? "" : value;
}

/** Blanks out description-row artifacts across every cell of a parsed table. */
export function sanitizeParsedTable(table: ParsedTable): ParsedTable {
    return {
        ...table,
        rows: table.rows.map((row) => {
            const sanitized: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
                sanitized[key] = sanitizeValue(value ?? "");
            }
            return sanitized;
        }),
    };
}
