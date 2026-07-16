/**
 * A CSV file uploaded manually is named "<Spreadsheet title> - <Tab name>.csv"
 * (Google Sheets' own export convention), while an Apps Script response keys
 * each table by the bare tab name. Any name-based table recognition has to
 * handle both — this normalizes a sourceName down to just its trailing
 * "tab name" segment before comparing.
 */
export function tableNameOf(sourceName: string): string {
    const segments = sourceName.split(" - ");
    return segments[segments.length - 1].trim().toLowerCase();
}

export function matchesTableName(sourceName: string, targetName: string): boolean {
    return tableNameOf(sourceName) === targetName.trim().toLowerCase();
}
