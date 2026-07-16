import Papa from "papaparse";
import type { ParsedTable } from "./types";

export function parseCsv(csvText: string, sourceName: string): ParsedTable {
    const result = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
    });

    const headers = result.meta.fields ?? [];

    const rows = result.data.filter((row) =>
        Object.values(row).some((value) => (value ?? "").toString().trim() !== "")
    );

    return { sourceName, headers, rows };
}
