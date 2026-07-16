export interface ParsedTable {
    sourceName: string;

    headers: string[];

    rows: Record<string, string>[];
}
