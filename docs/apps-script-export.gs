// Add this alongside your EXISTING doGet in the same Apps Script project — don't replace doGet, just add doPost
// next to it. Two separate concerns share this one doPost: translation (name/description) export from the main
// site, and item/mechanic export from the Blueprint Lab. If items/mechanics live in a DIFFERENT spreadsheet than
// item_name/item_desc in your setup, put this in THAT spreadsheet's Apps Script project instead (whichever one
// the relevant Web App URL — "Источник конфигурации" vs "Источник переводов" on the Источники page — points at).
//
// Setup:
//   1. Open the Apps Script project (Extensions → Apps Script from the spreadsheet, or script.google.com).
//   2. Paste this doPost function in (any .gs file in the project — doesn't need to be the same file as doGet).
//   3. Project Settings (gear icon) → Script Properties → add EXPORT_TOKEN with a value you pick (a random
//      string is fine — this is a shared-team deterrent, not real security, since there's no user login here).
//   4. Put that exact same value into the site's .env.local as VITE_SHEETS_EXPORT_TOKEN (see .env.example).
//   5. Deploy → Manage deployments → edit the existing deployment → New version → Deploy. (Editing the existing
//      deployment, not creating a new one, keeps the URL the site already uses unchanged.)
//
// Contract: POST body is JSON (sent as text/plain to dodge Apps Script's lack of CORS-preflight support —
// e.getPostData().getContents() is a plain string regardless of what Content-Type header the client used):
//   {
//     token: string,
//     names: { [key: string]: string },          // -> item_name's `ru` column, matched by `key`
//     descriptions: { [key: string]: string },   // -> item_desc's `ru` column, matched by `key`
//     items?: {                                   // Blueprint Lab — upserted by the sheet's `ItemId` column
//       Cards: { [itemId: string]: { [column: string]: string } },
//       Houses: { [itemId: string]: { [column: string]: string } },
//       Artefacts: { [itemId: string]: { [column: string]: string } },
//     },
//     newMechanicRows?: {                         // Blueprint Lab — ALWAYS appended, never matched/updated
//       [table: string]: { [column: string]: string }[],   // e.g. MechActivate, MechAddValue, ...
//     },
//   }
// `items`/`newMechanicRows` only ever write columns present in the payload — a column the site doesn't model
// (sprite names, unrelated flags, etc.) is left exactly as it already was in the sheet.

function doPost(e) {
    var result = { ok: true, updated: {} };

    try {
        var body = JSON.parse(e.postData.contents);
        var expectedToken = PropertiesService.getScriptProperties().getProperty("EXPORT_TOKEN");

        if (!expectedToken) {
            return jsonResponse({ ok: false, error: "EXPORT_TOKEN Script Property is not set on this Apps Script project" });
        }
        if (body.token !== expectedToken) {
            return jsonResponse({ ok: false, error: "Invalid token" });
        }

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        if (body.names) result.updated.item_name = upsertRows(ss, "item_name", body.names, result);
        if (body.descriptions) result.updated.item_desc = upsertRows(ss, "item_desc", body.descriptions, result);

        if (body.items) {
            for (var itemTable in body.items) {
                result.updated[itemTable] = upsertFullRows(ss, itemTable, "ItemId", body.items[itemTable], result);
            }
        }

        if (body.newMechanicRows) {
            for (var mechTable in body.newMechanicRows) {
                result.updated[mechTable] = appendFullRows(ss, mechTable, body.newMechanicRows[mechTable], result);
            }
        }

        return jsonResponse(result);
    } catch (error) {
        return jsonResponse({ ok: false, error: String(error) });
    }
}

// Writes `rows` (key -> new `ru` value) into `sheetName`, updating existing rows by `key` and appending any
// key not already present. Returns how many rows were touched (updated + appended).
function upsertRows(spreadsheet, sheetName, rows, result) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": sheet not found");
        return 0;
    }

    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var keyCol = header.indexOf("key");
    var ruCol = header.indexOf("ru");
    if (keyCol === -1 || ruCol === -1) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": 'key'/'ru' column not found in header row");
        return 0;
    }

    var sheetRowByKey = {};
    for (var i = 1; i < data.length; i++) {
        sheetRowByKey[data[i][keyCol]] = i + 1; // +1: sheet rows are 1-indexed, data[] is 0-indexed
    }

    var touched = 0;
    for (var key in rows) {
        var value = rows[key];
        var sheetRow = sheetRowByKey[key];
        if (sheetRow) {
            sheet.getRange(sheetRow, ruCol + 1).setValue(value);
        } else {
            var newRow = new Array(header.length).fill("");
            newRow[keyCol] = key;
            newRow[ruCol] = value;
            sheet.appendRow(newRow);
        }
        touched++;
    }
    return touched;
}

// Blueprint Lab item export: `rows` is { [idValue]: { column: value, ... } } — writes every provided column for
// a matching row (matched by `idColumnName`, e.g. "ItemId"), or appends a brand-new row if the id isn't found
// yet. Unlike upsertRows, a full set of columns can be written per row, and unknown column names in the payload
// are skipped with a warning rather than crashing the whole export (a stale/renamed column shouldn't block
// every other item in the same batch).
function upsertFullRows(spreadsheet, sheetName, idColumnName, rows, result) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": sheet not found");
        return 0;
    }

    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var idCol = header.indexOf(idColumnName);
    if (idCol === -1) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": '" + idColumnName + "' column not found in header row");
        return 0;
    }

    var sheetRowById = {};
    for (var i = 1; i < data.length; i++) {
        sheetRowById[data[i][idCol]] = i + 1; // +1: sheet rows are 1-indexed, data[] is 0-indexed
    }

    var touched = 0;
    for (var id in rows) {
        var columns = rows[id];
        var sheetRow = sheetRowById[id];

        if (sheetRow) {
            for (var colName in columns) {
                var colIndex = header.indexOf(colName);
                if (colIndex === -1) {
                    result.errors = result.errors || [];
                    result.errors.push(sheetName + ": unknown column '" + colName + "', skipped for " + id);
                    continue;
                }
                sheet.getRange(sheetRow, colIndex + 1).setValue(columns[colName]);
            }
        } else {
            var newRow = new Array(header.length).fill("");
            newRow[idCol] = id;
            for (var newColName in columns) {
                var newColIndex = header.indexOf(newColName);
                if (newColIndex === -1) {
                    result.errors = result.errors || [];
                    result.errors.push(sheetName + ": unknown column '" + newColName + "', skipped for " + id);
                    continue;
                }
                newRow[newColIndex] = columns[newColName];
            }
            sheet.appendRow(newRow);
        }
        touched++;
    }
    return touched;
}

// Blueprint Lab new-mechanic-row export: `rows` is an array of { column: value, ... } objects, each ALWAYS
// appended as a brand-new sheet row — no matching/lookup against existing rows at all (see the site-side
// GameStore.exportBlueprintChanges doc for why: a mechanic row's local id isn't a stable real spreadsheet key,
// so an in-place update here could silently overwrite the wrong row).
function appendFullRows(spreadsheet, sheetName, rows, result) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": sheet not found");
        return 0;
    }

    var header = sheet.getDataRange().getValues()[0];

    for (var i = 0; i < rows.length; i++) {
        var columns = rows[i];
        var newRow = new Array(header.length).fill("");
        for (var colName in columns) {
            var colIndex = header.indexOf(colName);
            if (colIndex === -1) {
                result.errors = result.errors || [];
                result.errors.push(sheetName + ": unknown column '" + colName + "', skipped on append");
                continue;
            }
            newRow[colIndex] = columns[colName];
        }
        sheet.appendRow(newRow);
    }
    return rows.length;
}

function jsonResponse(payload) {
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
