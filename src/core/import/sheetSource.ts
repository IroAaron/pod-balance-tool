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

/** A plain Google Sheets link only exposes a single tab via CSV export. */
export async function fetchGoogleSheetCsv(url: string, sourceName: string): Promise<ParsedTable[]> {
    const { spreadsheetId, gid } = parseGoogleSheetUrl(url);
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gid ? `&gid=${gid}` : ""}`;

    const response = await fetch(exportUrl);
    if (!response.ok) {
        throw new Error(`Не удалось скачать таблицу (HTTP ${response.status}). Проверьте, что доступ открыт по ссылке.`);
    }

    const text = await response.text();
    return [parseCsv(text, sourceName)];
}

/**
 * An Apps Script web app is expected to return JSON shaped
 * `{ [tabName]: Array<Record<string, string>> }` — one entry per
 * spreadsheet tab, each an array of row objects keyed by header. This is
 * how a single URL can cover Items + Translations + all mechanic tables.
 */
export async function fetchAppsScriptJson(url: string): Promise<ParsedTable[]> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Не удалось получить данные из Apps Script (HTTP ${response.status})`);
    }

    const json = (await response.json()) as Record<string, Array<Record<string, string>>>;

    return Object.entries(json).map(([sourceName, rows]) => ({
        sourceName,
        headers: rows.length > 0 ? Object.keys(rows[0]) : [],
        rows,
    }));
}

export async function fetchSourceTables(url: string, sourceLabel: string): Promise<ParsedTable[]> {
    if (isGoogleSheetsUrl(url)) {
        return fetchGoogleSheetCsv(url, sourceLabel);
    }

    return fetchAppsScriptJson(url);
}
