import { parseCsv } from "./csv";
import type { ParsedTable } from "./types";

function isGoogleSheetsUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.hostname === "docs.google.com" && parsed.pathname.includes("/spreadsheets/");
    } catch {
        return false;
    }
}

function parseGoogleSheetUrl(url: string): { spreadsheetId: string; gid?: string } {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) {
        throw new Error("Не удалось распознать ссылку на Google Sheets");
    }

    const gidMatch = url.match(/[?#&]gid=(\d+)/);

    return { spreadsheetId: idMatch[1], gid: gidMatch?.[1] };
}

/**
 * Cache-busting query param, appended to every fetch below — without it the exact same URL gets hit on every
 * "Скачать" click, and both the browser's own HTTP cache and Google's own edge caching of Sheets CSV exports /
 * Apps Script Web App responses can silently serve a stale response instead of the just-edited sheet data (the
 * `cache: "no-store"` fetch option alone only stops the *browser* from reusing a cached response — it doesn't
 * stop an upstream cache keyed by URL from doing the same, so a genuinely different URL each time is what
 * actually guarantees a fresh fetch here).
 */
function cacheBustParam(): string {
    return `_t=${Date.now()}`;
}

/** A plain Google Sheets link only exposes a single tab via CSV export. */
export async function fetchGoogleSheetCsv(url: string, sourceName: string): Promise<ParsedTable[]> {
    const { spreadsheetId, gid } = parseGoogleSheetUrl(url);
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gid ? `&gid=${gid}` : ""}&${cacheBustParam()}`;

    const response = await fetch(exportUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Не удалось скачать таблицу (HTTP ${response.status}). Проверьте, что доступ открыт по ссылке.`);
    }

    const text = await response.text();
    return [parseCsv(text, sourceName)];
}

/**
 * getValues()-backed Apps Script responses carry native cell types (numbers,
 * booleans) for numeric-looking cells, not just strings. Every other part of
 * the pipeline assumes string values (per ParsedTable's contract), so cells
 * are coerced here — the one place that talks to the untyped JSON response.
 */
function cellToString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    return String(value);
}

function stringifyRow(row: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
        result[key] = cellToString(value);
    }
    return result;
}

/**
 * An Apps Script web app is expected to return JSON shaped
 * `{ [tabName]: Array<Record<string, string>> }` — one entry per
 * spreadsheet tab, each an array of row objects keyed by header. This is
 * how a single URL can cover Items + Translations + all mechanic tables.
 */
export async function fetchAppsScriptJson(url: string): Promise<ParsedTable[]> {
    const bustedUrl = new URL(url);
    bustedUrl.searchParams.set("_t", Date.now().toString());

    const response = await fetch(bustedUrl.toString(), { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Не удалось получить данные из Apps Script (HTTP ${response.status})`);
    }

    const json = (await response.json()) as Record<string, Array<Record<string, unknown>>>;

    return Object.entries(json).map(([sourceName, rawRows]) => {
        const rows = rawRows.map(stringifyRow);
        // Union of keys across every row, not just the first — a sparse first row (e.g. a blank cell in a
        // placeholder/comment row) would otherwise silently drop a column from `headers` for the whole table.
        const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
        return { sourceName, headers, rows };
    });
}

export async function fetchSourceTables(url: string, sourceLabel: string): Promise<ParsedTable[]> {
    if (isGoogleSheetsUrl(url)) {
        return fetchGoogleSheetCsv(url, sourceLabel);
    }

    return fetchAppsScriptJson(url);
}
