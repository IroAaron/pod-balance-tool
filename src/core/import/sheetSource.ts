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

/**
 * One in-place edit to an existing mechanic row. Mechanic rows have no unique key of their own, so the target
 * is addressed by `itemId` plus `ordinal` (its position among that item's rows in that table) — stable against
 * unrelated rows moving — and `originalFields` lets the receiver confirm it found the right row before writing.
 */
export interface MechanicRowUpdate {
    itemId: string;

    ordinal: number;

    /** Every column the table defines, blanks included, so cleared fields actually clear in the sheet. */
    fields: Record<string, string>;

    /** The same columns as they were at import time — a mismatch means the sheet moved on and the write is refused. */
    originalFields: Record<string, string>;
}

export interface ExportPayload {
    token: string;

    /** translation key -> new value, written into item_name's `ru` column. */
    names: Record<string, string>;

    /** translation key -> new value, written into item_desc's `ru` column. */
    descriptions: Record<string, string>;

    /** Content editor item edits — table -> ItemId -> full column bag, upserted by ItemId (safe: unique per item). */
    items?: Record<"Cards" | "Houses" | "Artefacts", Record<string, Record<string, string>>>;

    /** Content editor brand-new mechanic rows — table -> full rows, always appended, never matched against an
     *  existing row (MechanicRow.id isn't a real spreadsheet key, see GameStore.exportContentChanges's doc). */
    newMechanicRows?: Partial<Record<string, Record<string, string>[]>>;

    /** Content editor edits to already-existing mechanic rows — table -> in-place updates, each addressed by
     *  ItemId + ordinal and guarded by the as-imported values. See GameStore.exportContentChanges's doc. */
    updatedMechanicRows?: Partial<Record<string, MechanicRowUpdate[]>>;

    /** Decks page edits — table -> DeckId -> full row set for that deck (replaces every existing row for that
     *  DeckId, see GameStore.exportDeckChanges's doc). An empty array for a DeckId means "delete this deck". */
    decks?: Partial<Record<"Decks" | "DecksShop", Record<string, Record<string, string>[]>>>;

    /** Packs page edits — PackId -> full row set for that pack (same replace-by-group-id shape as `decks`, see
     *  GameStore.exportPackChanges's doc). An empty array for a PackId means "delete this pack". */
    packs?: Record<string, Record<string, string>[]>;

    /** Balls page edits — ItemId -> full column bag, upserted by ItemId (same shape as `items`, Balls is a flat
     *  row-per-object table like Items, no grouping — see GameStore.exportBallChanges's doc). */
    balls?: Record<string, Record<string, string>>;

    /** Ball decks ("Колоды шаров" tab) edits — DeckId -> ball id array, written across the sheet's repeated
     *  `Ball` columns as ONE row per group (see GameStore.exportDeckChanges's doc and the new
     *  `replaceWideGroupRow` Apps Script helper). An empty array for a DeckId means "delete this ball deck". */
    ballGroups?: Record<string, string[]>;

    /** Rounds page edits (see GameStore.exportRoundChanges's doc) — `fields` upserts the ordinary one-column
     *  RoundRules/AdditionalInvisibleArtefact/TempDeck cells by RoundId (same shape as `balls`); `deckBalls`
     *  writes across RoundSettings' own repeated `DeckBalls` columns, reusing the same `replaceWideGroupRow`
     *  helper built for `ballGroups`. No delete signal — rounds are never removed from the site. */
    rounds?: {
        fields: Record<string, Record<string, string>>;
        deckBalls: Record<string, string[]>;
    };

    /** Sprints page edits (see GameStore.exportSprintChanges's doc) — SprintId -> full row set for that sprint,
     *  same replace-by-group-id shape as `decks`/`packs`, except each row ALSO carries `repeatedValues` written
     *  across the sheet's own repeated `RoundSettings` columns (same technique as `ballGroups`/`rounds.deckBalls`,
     *  combined onto one row via the new `replaceRowsByGroupIdWithRepeatedColumn` Apps Script helper). `columns`
     *  includes a freshly-computed `RoundNumber` (1-indexed row position) on every row. An empty array for a
     *  SprintId means "delete this sprint". */
    sprints?: Record<string, { columns: Record<string, string>; repeatedValues: string[] }[]>;
}

export interface ExportResult {
    ok: boolean;

    /** Rows written per sheet, only present when ok. */
    updated?: Record<string, number>;

    error?: string;
}

/**
 * POSTs to the same Apps Script Web App URL used for reads — it needs a `doPost` handler added (see the Apps
 * Script snippet given alongside this feature) that checks `token` against a Script Property before writing.
 * Sent as `Content-Type: text/plain`, not `application/json` — a real content-type triggers a CORS preflight
 * (OPTIONS) request first, which Apps Script Web Apps don't handle (no doOptions), so the browser blocks the
 * actual POST entirely. `text/plain` is a CORS "simple request" (no preflight); `e.postData.contents` on the
 * Apps Script side receives the same raw JSON string either way, and JSON.parse there doesn't care about the
 * header we sent it under.
 */
export async function postExportPayload(url: string, payload: ExportPayload): Promise<ExportResult> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Не удалось отправить данные (HTTP ${response.status})`);
    }

    return (await response.json()) as ExportResult;
}
