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

/**
 * Tabs the real spreadsheets carry that this site deliberately doesn't consume (game/UI config, not item or
 * balance data — confirmed with the project owner). They classify as Unknown, which is correct, but warning
 * about them on every single import is a permanent false alarm on an otherwise fully successful download —
 * loud enough to read as "the import failed". They still appear in the per-table breakdown as Unknown, so
 * nothing is hidden; only the alarm is dropped. An unknown tab that *isn't* on this list is still worth
 * warning about — that's a genuinely unrecognized table.
 */
const INTENTIONALLY_UNSUPPORTED_TABS = new Set([
    "словарь значков",
    "colors",
    "playerbuttons",
    "shopsettings",
    "itemupgrading",
    "reactions",
    "corridor",
    "meta",
]);

export function isIntentionallyUnsupportedTable(sourceName: string): boolean {
    return INTENTIONALLY_UNSUPPORTED_TABS.has(tableNameOf(sourceName));
}
