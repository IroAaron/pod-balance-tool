// Add this alongside your EXISTING doGet in the same Apps Script project (the one whose Web App URL is the
// site's "Источник переводов" on the Источники page) — don't replace doGet, just add doPost next to it.
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
//   { token: string, names: { [key: string]: string }, descriptions: { [key: string]: string } }
// Writes each `names`/`descriptions` entry into item_name/item_desc's `ru` column, matched by the `key` column —
// updates the row if the key already exists, appends a new row if it doesn't.

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

function jsonResponse(payload) {
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
