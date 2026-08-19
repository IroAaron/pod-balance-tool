// Add this alongside your EXISTING doGet in the same Apps Script project — don't replace doGet, just add doPost
// next to it. Two separate concerns share this one doPost: translation (name/description) export from the main
// site, and item/mechanic export from the item cards. If items/mechanics live in a DIFFERENT spreadsheet than
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
//     items?: {                                   // Content editor — upserted by the sheet's `ItemId` column
//       Cards: { [itemId: string]: { [column: string]: string } },
//       Houses: { [itemId: string]: { [column: string]: string } },
//       Artefacts: { [itemId: string]: { [column: string]: string } },
//     },
//     newMechanicRows?: {                         // Content editor — ALWAYS appended, never matched/updated
//       [table: string]: { [column: string]: string }[],   // e.g. MechActivate, MechAddValue, ...
//     },
//     updatedMechanicRows?: {                     // Content editor — in-place edits to EXISTING mechanic rows.
//       [table: string]: {                        // A mechanic row has no unique key, so the target is
//         itemId: string,                         // addressed by ItemId + ordinal (its position among that
//         ordinal: number,                        // item's rows in this table), and `originalFields` must
//         fields: { [column: string]: string },        // still match the sheet or the write is REFUSED and
//         originalFields: { [column: string]: string }, // reported as a conflict — never silently clobbered.
//       }[],
//     },
//     deletedMechanicRows?: {                     // Rows removed on the site — same ItemId+ordinal addressing
//       [table: string]: {                        // and same originalFields guard as updatedMechanicRows.
//         itemId: string, ordinal: number, originalFields: { [column: string]: string },
//       }[],
//     },
//     upgradeChains?: {                            // CardUpgrades — upserted by UpgradeChainId. Unused tier
//       [chainId: string]: { [column: string]: string },   // columns arrive blank so a shortened chain clears.
//     },
//     replaceRules?: {                             // REPLACES every row for a given ItemIdToReplace; an empty
//       [table: string]: {                         // array removes that item's rules entirely.
//         [itemIdToReplace: string]: { [column: string]: string }[],
//       },
//     },
//     decks?: {                                    // Decks page — REPLACES every row for a given DeckId
//       Decks?: { [deckId: string]: { [column: string]: string }[] },
//       DecksShop?: { [deckId: string]: { [column: string]: string }[] },
//     },
//     packs?: {                                    // Packs page — REPLACES every row for a given PackId
//       [packId: string]: { [column: string]: string }[],
//     },
//     balls?: {                                    // Balls page — upserted by the sheet's `ItemId` column
//       [itemId: string]: { [column: string]: string },
//     },
//     ballGroups?: {                                // Ball decks ("Колоды шаров") — REPLACES the one row for a
//       [deckId: string]: string[],                 // given DeckId, writing values across every repeated `Ball`
//     },                                            // column. Empty array deletes that ball deck's row.
//     rounds?: {                                    // Rounds page — writes into RoundSettings
//       fields: {                                    // upserted by RoundId (RoundRules/AdditionalInvisibleArtefact/TempDeck)
//         [roundId: string]: { [column: string]: string },
//       },
//       deckBalls: {                                 // REPLACES the one row for a given RoundId, writing values
//         [roundId: string]: string[],                // across every repeated `DeckBalls` column
//       },
//     },
//     sprints?: {                                    // Sprints page — REPLACES every row for a given SprintId
//       [sprintId: string]: {
//         columns: { [column: string]: string },       // ordinary one-column fields, incl. a fresh RoundNumber
//         repeatedValues: string[],                     // written across every repeated `RoundSettings` column
//       }[],                                           // one entry per row/round, in order. Empty array deletes.
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

        if (body.updatedMechanicRows) {
            for (var updTable in body.updatedMechanicRows) {
                result.updated[updTable + ":updated"] = updateMechanicRows(ss, updTable, body.updatedMechanicRows[updTable], result);
            }
        }

        // Deletes run after the updates above: both address rows by ordinal, and removing a row renumbers the
        // ones behind it, so doing it last (and highest-ordinal-first inside the helper) keeps every target valid.
        if (body.deletedMechanicRows) {
            for (var delTable in body.deletedMechanicRows) {
                result.updated[delTable + ":deleted"] = deleteMechanicRows(ss, delTable, body.deletedMechanicRows[delTable], result);
            }
        }

        // CardUpgrades is one row per chain keyed by UpgradeChainId — an ordinary upsert, no new helper needed.
        if (body.upgradeChains) {
            result.updated.CardUpgrades = upsertFullRows(ss, "CardUpgrades", "UpgradeChainId", body.upgradeChains, result);
        }

        // Replace rules have several rows per ItemIdToReplace and no per-row key, so they're grouped-replace —
        // the same shape as Decks/Packs, reusing that helper as-is.
        if (body.replaceRules) {
            for (var replaceTable in body.replaceRules) {
                result.updated[replaceTable] = replaceRowsByGroupId(
                    ss,
                    replaceTable,
                    "ItemIdToReplace",
                    body.replaceRules[replaceTable],
                    result
                );
            }
        }

        if (body.decks) {
            for (var deckTable in body.decks) {
                result.updated[deckTable] = replaceRowsByGroupId(ss, deckTable, "DeckId", body.decks[deckTable], result);
            }
        }

        // Packs is grouped-by-id the same way Decks/DecksShop are (one row per source-deck entry per pack, no
        // stable per-row key) — reuses the exact same helper, just against the Packs sheet/PackId column.
        if (body.packs) {
            result.updated.Packs = replaceRowsByGroupId(ss, "Packs", "PackId", body.packs, result);
        }

        // Balls is a flat row-per-object table like Items — reuses upsertFullRows as-is, no new helper needed.
        if (body.balls) {
            result.updated.Balls = upsertFullRows(ss, "Balls", "ItemId", body.balls, result);
        }

        // BallGroups is a WIDE one-row-per-group table (7 same-named "Ball" columns) — upsertFullRows/
        // replaceRowsByGroupId both assume a narrow row shape and can't address repeated-name columns.
        if (body.ballGroups) {
            result.updated.BallGroups = replaceWideGroupRow(ss, "BallGroups", "DeckId", "Ball", body.ballGroups, result);
        }

        // Rounds page — RoundSettings mixes both row shapes: ordinary one-column fields (upsertFullRows) and its
        // own repeated "DeckBalls" columns (replaceWideGroupRow, same helper BallGroups uses).
        if (body.rounds) {
            result.updated.RoundSettings = upsertFullRows(ss, "RoundSettings", "RoundId", body.rounds.fields, result);
            replaceWideGroupRow(ss, "RoundSettings", "RoundId", "DeckBalls", body.rounds.deckBalls, result);
        }

        // Sprints mixes both group-replace shapes on the same row (ordinary columns AND a repeated column) —
        // neither replaceRowsByGroupId nor replaceWideGroupRow alone fits, see the combined helper below.
        if (body.sprints) {
            result.updated.Sprints = replaceRowsByGroupIdWithRepeatedColumn(
                ss, "Sprints", "SprintId", "RoundSettings", body.sprints, result
            );
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

// Item export: `rows` is { [idValue]: { column: value, ... } } — writes every provided column for
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

// In-place mechanic edits: each update names its target by `itemId` + `ordinal` (the Nth row for
// that item in this sheet, counted in sheet order) rather than an absolute row number, so rows added or removed
// elsewhere can't shift it. Before writing, every column in `originalFields` must still match the sheet — if
// even one differs, the row was changed or reordered by someone else since the site imported it, so the write
// is REFUSED for that row and reported in `result.errors` instead of overwriting whatever is there now.
function updateMechanicRows(spreadsheet, sheetName, updates, result) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": sheet not found");
        return 0;
    }

    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var idCol = header.indexOf("ItemId");
    if (idCol === -1) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": 'ItemId' column not found in header row");
        return 0;
    }

    // itemId -> sheet row numbers holding it, in sheet order; index into this is the payload's `ordinal`.
    var rowsByItemId = {};
    for (var i = 1; i < data.length; i++) {
        var id = String(data[i][idCol]).trim();
        if (!id) continue;
        (rowsByItemId[id] = rowsByItemId[id] || []).push(i + 1); // +1: sheet rows are 1-indexed
    }

    var updated = 0;
    for (var u = 0; u < updates.length; u++) {
        var upd = updates[u];
        var candidates = rowsByItemId[upd.itemId] || [];
        var sheetRow = candidates[upd.ordinal];

        if (!sheetRow) {
            result.errors = result.errors || [];
            result.errors.push(
                sheetName + ": no row #" + (upd.ordinal + 1) + " for ItemId '" + upd.itemId + "' (found " + candidates.length + ")"
            );
            continue;
        }

        var conflict = null;
        for (var origCol in upd.originalFields) {
            var origIndex = header.indexOf(origCol);
            if (origIndex === -1) continue; // column the sheet doesn't have — nothing to compare or write
            var inSheet = String(data[sheetRow - 1][origIndex]).trim();
            var expected = String(upd.originalFields[origCol]).trim();
            if (inSheet !== expected) {
                conflict = origCol + ": sheet has '" + inSheet + "', site imported '" + expected + "'";
                break;
            }
        }
        if (conflict) {
            result.errors = result.errors || [];
            result.errors.push(
                sheetName + " row " + sheetRow + " (ItemId '" + upd.itemId + "') changed since import, not overwritten — " + conflict
            );
            continue;
        }

        for (var colName in upd.fields) {
            var colIndex = header.indexOf(colName);
            if (colIndex === -1) {
                result.errors = result.errors || [];
                result.errors.push(sheetName + ": unknown column '" + colName + "', skipped for " + upd.itemId);
                continue;
            }
            sheet.getRange(sheetRow, colIndex + 1).setValue(upd.fields[colName]);
        }
        updated++;
    }
    return updated;
}

// Removes mechanic rows deleted on the site. Same addressing and same safety rule as updateMechanicRows: the
// target is ItemId + ordinal, and every column in `originalFields` must still match or the row is left alone and
// reported. Deletions are applied highest-ordinal-first so removing one doesn't renumber the targets behind it.
function deleteMechanicRows(spreadsheet, sheetName, deletions, result) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": sheet not found");
        return 0;
    }

    var data = sheet.getDataRange().getValues();
    var header = data[0];
    var idCol = header.indexOf("ItemId");
    if (idCol === -1) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": 'ItemId' column not found in header row");
        return 0;
    }

    var rowsByItemId = {};
    for (var i = 1; i < data.length; i++) {
        var id = String(data[i][idCol]).trim();
        if (!id) continue;
        (rowsByItemId[id] = rowsByItemId[id] || []).push(i + 1);
    }

    // Resolve every target to a real sheet row first, then delete from the bottom up.
    var targets = [];
    for (var d = 0; d < deletions.length; d++) {
        var del = deletions[d];
        var candidates = rowsByItemId[del.itemId] || [];
        var sheetRow = candidates[del.ordinal];

        if (!sheetRow) {
            result.errors = result.errors || [];
            result.errors.push(sheetName + ": no row #" + (del.ordinal + 1) + " for ItemId '" + del.itemId + "' to delete");
            continue;
        }

        var conflict = null;
        for (var origCol in del.originalFields) {
            var origIndex = header.indexOf(origCol);
            if (origIndex === -1) continue;
            var inSheet = String(data[sheetRow - 1][origIndex]).trim();
            var expected = String(del.originalFields[origCol]).trim();
            if (inSheet !== expected) {
                conflict = origCol + ": sheet has '" + inSheet + "', site imported '" + expected + "'";
                break;
            }
        }
        if (conflict) {
            result.errors = result.errors || [];
            result.errors.push(
                sheetName + " row " + sheetRow + " (ItemId '" + del.itemId + "') changed since import, not deleted — " + conflict
            );
            continue;
        }

        targets.push(sheetRow);
    }

    targets.sort(function (a, b) {
        return b - a;
    });
    for (var t = 0; t < targets.length; t++) sheet.deleteRow(targets[t]);
    return targets.length;
}

// New-mechanic-row export: `rows` is an array of { column: value, ... } objects, each ALWAYS
// appended as a brand-new sheet row — no matching/lookup against existing rows at all, since a row authored on
// the canvas never corresponded to an existing sheet row in the first place.
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

// Decks page export: `rowsByGroupId` is { [groupId]: { column: value, ... }[] } — for each groupId, deletes every
// existing sheet row whose `groupIdColumnName` cell matches it, then appends the provided rows fresh (each gets
// the groupId written into `groupIdColumnName` automatically). Unlike upsertFullRows (one row per unique id, patch
// columns in place) or appendFullRows (always append, no matching at all), this replaces a *variable-size group*
// of rows sharing one id — the right fit for a deck, whose entries can be added/removed/reordered as a whole, not
// just column-patched on a fixed row. An empty array for a groupId deletes that group's rows with nothing added
// back — this is how the site represents "this deck was deleted" without a separate signal.
function replaceRowsByGroupId(spreadsheet, sheetName, groupIdColumnName, rowsByGroupId, result) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": sheet not found");
        return 0;
    }

    var header = sheet.getDataRange().getValues()[0];
    var groupIdCol = header.indexOf(groupIdColumnName);
    if (groupIdCol === -1) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": '" + groupIdColumnName + "' column not found in header row");
        return 0;
    }

    var touched = 0;

    for (var groupId in rowsByGroupId) {
        // Re-read fresh data/row numbers each iteration — earlier deletions in this same loop shift every row
        // below them, so a row-number map built once at the top would go stale after the first delete.
        var data = sheet.getDataRange().getValues();
        var rowsToDelete = [];
        for (var i = 1; i < data.length; i++) {
            if (data[i][groupIdCol] === groupId) {
                rowsToDelete.push(i + 1); // +1: sheet rows are 1-indexed, data[] is 0-indexed
            }
        }
        // Bottom-to-top, so deleting a row never shifts the index of one still queued for deletion.
        rowsToDelete.sort(function (a, b) { return b - a; });
        for (var d = 0; d < rowsToDelete.length; d++) {
            sheet.deleteRow(rowsToDelete[d]);
        }

        var newRows = rowsByGroupId[groupId];
        for (var r = 0; r < newRows.length; r++) {
            var columns = newRows[r];
            var newRow = new Array(header.length).fill("");
            newRow[groupIdCol] = groupId;
            for (var colName in columns) {
                var colIndex = header.indexOf(colName);
                if (colIndex === -1) {
                    result.errors = result.errors || [];
                    result.errors.push(sheetName + ": unknown column '" + colName + "', skipped for " + groupId);
                    continue;
                }
                newRow[colIndex] = columns[colName];
            }
            sheet.appendRow(newRow);
        }
        touched += newRows.length;
    }

    return touched;
}

// Ball decks / Round DeckBalls export: `rowsByGroupId` is { [groupId]: string[] } — for each groupId, writes the
// values into the SINGLE existing row's repeated `repeatedColumnName` columns (e.g. all 7 "Ball" columns), or
// appends a brand-new row if the groupId isn't found yet. An empty array deletes that row entirely. This exists
// because the real sheet has multiple columns sharing the EXACT SAME literal header name (unlike the client-side
// Papa.parse view, which renames duplicates to Ball_1, Ball_2, ...) — header.indexOf only ever finds the first
// match, so every other helper here (which assumes one column per name) can't address the rest. This scans the
// header once for ALL matching column indices instead, and writes/clears exactly that many slots, blanking any
// leftover slots beyond the provided values (e.g. shrinking a deck from 5 balls to 3 must clear the old 4th/5th).
function replaceWideGroupRow(spreadsheet, sheetName, groupIdColumnName, repeatedColumnName, rowsByGroupId, result) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": sheet not found");
        return 0;
    }

    var header = sheet.getDataRange().getValues()[0];
    var groupIdCol = header.indexOf(groupIdColumnName);
    if (groupIdCol === -1) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": '" + groupIdColumnName + "' column not found in header row");
        return 0;
    }

    var repeatedCols = [];
    for (var h = 0; h < header.length; h++) {
        if (header[h] === repeatedColumnName) {
            repeatedCols.push(h);
        }
    }
    if (repeatedCols.length === 0) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": '" + repeatedColumnName + "' column not found in header row");
        return 0;
    }

    var touched = 0;

    for (var groupId in rowsByGroupId) {
        // Re-read fresh data/row numbers each iteration — earlier deletions in this same loop shift every row
        // below them, so a row-number map built once at the top would go stale after the first delete.
        var data = sheet.getDataRange().getValues();
        var sheetRow = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][groupIdCol] === groupId) {
                sheetRow = i + 1; // +1: sheet rows are 1-indexed, data[] is 0-indexed
                break;
            }
        }

        var values = rowsByGroupId[groupId];

        if (values.length === 0) {
            if (sheetRow !== -1) {
                sheet.deleteRow(sheetRow);
            }
            touched++;
            continue;
        }

        if (sheetRow === -1) {
            var newRow = new Array(header.length).fill("");
            newRow[groupIdCol] = groupId;
            for (var n = 0; n < repeatedCols.length; n++) {
                newRow[repeatedCols[n]] = n < values.length ? values[n] : "";
            }
            sheet.appendRow(newRow);
        } else {
            for (var c = 0; c < repeatedCols.length; c++) {
                var value = c < values.length ? values[c] : "";
                sheet.getRange(sheetRow, repeatedCols[c] + 1).setValue(value);
            }
        }
        touched++;
    }

    return touched;
}

// Sprints page export: `rowsByGroupId` is { [groupId]: { columns: {...}, repeatedValues: string[] }[] } — combines
// replaceRowsByGroupId's technique (delete every existing row for a groupId, then append the fresh row set) with
// replaceWideGroupRow's technique (spread values across every column sharing a repeated name), because Sprints
// needs BOTH shapes on the SAME row: ordinary one-column fields (Quota/Stage/RewardTickerts/...) written by name
// lookup, AND the sheet's own repeated `RoundSettings` columns (the round-id pool) written by index-scan. Each
// new row gets groupIdColumnName set automatically, its `columns` written by header-name lookup (unknown column
// names are skipped with a warning, same as replaceRowsByGroupId), and its `repeatedValues` spread across every
// column index sharing repeatedColumnName's exact name (blanking any slot beyond the provided values). An empty
// array for a groupId deletes that group's rows with nothing added back, same delete-signal convention as every
// other group-replace helper here.
function replaceRowsByGroupIdWithRepeatedColumn(spreadsheet, sheetName, groupIdColumnName, repeatedColumnName, rowsByGroupId, result) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": sheet not found");
        return 0;
    }

    var header = sheet.getDataRange().getValues()[0];
    var groupIdCol = header.indexOf(groupIdColumnName);
    if (groupIdCol === -1) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": '" + groupIdColumnName + "' column not found in header row");
        return 0;
    }

    var repeatedCols = [];
    for (var h = 0; h < header.length; h++) {
        if (header[h] === repeatedColumnName) {
            repeatedCols.push(h);
        }
    }
    if (repeatedCols.length === 0) {
        result.errors = result.errors || [];
        result.errors.push(sheetName + ": '" + repeatedColumnName + "' column not found in header row");
        return 0;
    }

    var touched = 0;

    for (var groupId in rowsByGroupId) {
        // Re-read fresh data/row numbers each iteration — earlier deletions in this same loop shift every row
        // below them, so a row-number map built once at the top would go stale after the first delete.
        var data = sheet.getDataRange().getValues();
        var rowsToDelete = [];
        for (var i = 1; i < data.length; i++) {
            if (data[i][groupIdCol] === groupId) {
                rowsToDelete.push(i + 1); // +1: sheet rows are 1-indexed, data[] is 0-indexed
            }
        }
        rowsToDelete.sort(function (a, b) { return b - a; });
        for (var d = 0; d < rowsToDelete.length; d++) {
            sheet.deleteRow(rowsToDelete[d]);
        }

        var newRows = rowsByGroupId[groupId];
        for (var r = 0; r < newRows.length; r++) {
            var newRow = new Array(header.length).fill("");
            newRow[groupIdCol] = groupId;

            var columns = newRows[r].columns;
            for (var colName in columns) {
                var colIndex = header.indexOf(colName);
                if (colIndex === -1) {
                    result.errors = result.errors || [];
                    result.errors.push(sheetName + ": unknown column '" + colName + "', skipped for " + groupId);
                    continue;
                }
                newRow[colIndex] = columns[colName];
            }

            var values = newRows[r].repeatedValues;
            for (var c = 0; c < repeatedCols.length; c++) {
                newRow[repeatedCols[c]] = c < values.length ? values[c] : "";
            }

            sheet.appendRow(newRow);
        }
        touched += newRows.length;
    }

    return touched;
}

function jsonResponse(payload) {
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
