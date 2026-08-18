import type { ParsedTable } from "./types";
import type { ClassifiedTable } from "./tableClassifier";
import type { Item } from "../models/Item";
import type { Translation } from "../models/Translation";
import type { MechanicRow, MechanicTableName } from "../models/Mechanic";
import type { UpgradeChain } from "../models/UpgradeChain";
import type { Round } from "../models/Round";
import type { Deck, DeckEntry, DeckSource } from "../models/Deck";
import type { Pack, PackSourceEntry } from "../models/Pack";
import type { Ball } from "../models/Ball";
import type { BallGroup } from "../models/BallGroup";
import type { Sprint, SprintRound } from "../models/Sprint";
import type { ReplaceRule, ReplaceRuleSource } from "../models/ReplaceRule";
import { isIntentionallyUnsupportedTable, tableNameOf } from "./tableNames";

export interface NormalizedData {
    items: Item[];

    translations: Translation[];

    mechanics: MechanicRow[];

    upgradeChains: UpgradeChain[];

    rounds: Round[];

    decks: Deck[];

    packs: Pack[];

    balls: Ball[];

    ballGroups: BallGroup[];

    sprints: Sprint[];

    replaceRules: ReplaceRule[];

    /** Valid values per parameter dimension, as curated in the Enums sheet. */
    enumValues: Record<string, string[]>;
}

export interface ImportWarning {
    sourceName: string;

    message: string;
}

/** These tables have no ItemType column at all — the category is implicit in which table a row came from. */
const ITEM_CATEGORY_HINTS: Record<string, string> = {
    cards: "Card",
    houses: "House",
    artefacts: "Artefact",
};

function splitList(value: string): string[] {
    return value
        .split(/[|,;]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function findColumn(headers: string[], candidates: string[]): string | undefined {
    const normalized = headers.map((header) => header.trim().toLowerCase());
    for (const candidate of candidates) {
        const index = normalized.indexOf(candidate.toLowerCase());
        if (index !== -1) return headers[index];
    }
    return undefined;
}

/** Fallback for real sheets whose columns don't match the documented names exactly. */
function findColumnContaining(headers: string[], substrings: string[]): string | undefined {
    const normalized = headers.map((header) => header.trim().toLowerCase());
    for (const substring of substrings) {
        const index = normalized.findIndex((header) => header.includes(substring));
        if (index !== -1) return headers[index];
    }
    return undefined;
}

/** Parses a numeric config cell — blank/unparseable is undefined, not 0, so callers can tell "no value" from "zero". Some real rows use a comma decimal separator (e.g. "1,01"). */
export function parseOptionalNumber(value: string | undefined): number | undefined {
    const trimmed = (value ?? "").trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isNaN(parsed) ? undefined : parsed;
}

/** Parses a boolean-shaped config cell (real data only ever uses blank or "1", never "0") — blank is undefined,
 *  not false, matching parseOptionalNumber's "no value" vs "zero" distinction. */
export function parseOptionalBoolean(value: string | undefined): boolean | undefined {
    return (value ?? "").trim() === "1" ? true : undefined;
}

function normalizeItemsTable(table: ParsedTable): Item[] {
    const idColumn = findColumn(table.headers, ["ItemId", "Id"]);
    if (!idColumn) return [];

    const tagsColumn = findColumn(table.headers, ["ItemTag", "Tags"]) ?? findColumnContaining(table.headers, ["tag"]);
    // Exact match only — "type" as a substring also matches ValueUsageType/BonusCountingType/etc,
    // which are different dimensions entirely, not the item's own category.
    const typeColumn = findColumn(table.headers, ["ItemType", "Type"]);
    const nameKeyColumn = findColumn(table.headers, ["NameKey", "Name"]);
    const descKeyColumn = findColumn(table.headers, ["DescKey", "DescriptionKey", "Description"]);
    const valueMinColumn = findColumn(table.headers, ["ValueMin"]);
    const valueMaxColumn = findColumn(table.headers, ["ValueMax"]);
    const categoryHint = ITEM_CATEGORY_HINTS[tableNameOf(table.sourceName)];

    return table.rows
        .filter((row) => (row[idColumn] ?? "").trim() !== "")
        .map((row): Item => {
            const id = row[idColumn].trim();
            return {
                id,
                tags: tagsColumn ? splitList(row[tagsColumn] ?? "") : [],
                itemType: (typeColumn ? row[typeColumn]?.trim() : "") || categoryHint,
                nameKey: (nameKeyColumn ? row[nameKeyColumn]?.trim() : "") || id,
                descKey: (descKeyColumn ? row[descKeyColumn]?.trim() : "") || `${id}_desc`,
                valueMin: valueMinColumn ? parseOptionalNumber(row[valueMinColumn]) : undefined,
                valueMax: valueMaxColumn ? parseOptionalNumber(row[valueMaxColumn]) : undefined,
                raw: row,
            };
        });
}

function normalizeTranslationsTable(table: ParsedTable): Translation[] {
    const keyColumn = findColumn(table.headers, ["key"]);
    // "value" (legacy key/value sheets) takes priority; real sheets use per-language columns.
    const valueColumn = findColumn(table.headers, ["value", "ru", "en"]);
    if (!keyColumn || !valueColumn) return [];

    return table.rows
        .filter((row) => (row[keyColumn] ?? "").trim() !== "")
        .map((row) => ({
            key: row[keyColumn].trim(),
            value: row[valueColumn] ?? "",
        }));
}

function normalizeUpgradeChainsTable(table: ParsedTable): UpgradeChain[] {
    const chainIdColumn = findColumn(table.headers, ["UpgradeChainId"]);
    if (!chainIdColumn) return [];

    const tierColumns = table.headers
        .filter((header) => /^UpgradeId\d+$/i.test(header.trim()))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
            const numB = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
            return numA - numB;
        });

    return table.rows
        .filter((row) => (row[chainIdColumn] ?? "").trim() !== "")
        .map((row): UpgradeChain => ({
            id: row[chainIdColumn].trim(),
            itemIds: tierColumns
                .map((column) => row[column]?.trim())
                .filter((id): id is string => Boolean(id)),
        }));
}

function numericSuffix(header: string): number {
    return parseInt(header.match(/\d+/)?.[0] ?? "0", 10);
}

function normalizeRoundSettingsTable(table: ParsedTable): Round[] {
    const idColumn = findColumn(table.headers, ["RoundId"]);
    if (!idColumn) return [];

    const rulesColumn = findColumn(table.headers, ["RoundRules"]);
    const artefactColumn = findColumn(table.headers, ["AdditionalInvisibleArtefact"]);
    const tempDeckColumn = findColumn(table.headers, ["TempDeck"]);

    // Papa.parse renames the sheet's repeated "DeckBalls" header to DeckBalls, DeckBalls_1, DeckBalls_2, ... —
    // sorted numerically (missing suffix = 0) same as normalizeUpgradeChainsTable's tier columns, in case column
    // order in the source ever changes.
    const deckBallsColumns = table.headers
        .filter((header) => /^DeckBalls(_\d+)?$/i.test(header.trim()))
        .sort((a, b) => numericSuffix(a) - numericSuffix(b));

    return table.rows
        .filter((row) => (row[idColumn] ?? "").trim() !== "")
        .map((row): Round => {
            const id = row[idColumn].trim();
            return {
                id,
                rules: rulesColumn ? row[rulesColumn]?.trim() || undefined : undefined,
                invisibleArtefactId: artefactColumn ? row[artefactColumn]?.trim() || undefined : undefined,
                tempDeckId: tempDeckColumn ? row[tempDeckColumn]?.trim() || undefined : undefined,
                deckBalls: deckBallsColumns
                    .map((column) => row[column]?.trim())
                    .filter((value): value is string => Boolean(value)),
                descKey: `${id}_desc`,
                raw: row,
            };
        });
}

/**
 * Decks/DecksShop are row-per-(deck,item)-entry, not row-per-deck — this groups rows by DeckId into one Deck
 * object each, unlike every other normalizer here (all row -> object, this is row -> group -> object). Rows are
 * NOT deduplicated by item id within a deck — a repeated (DeckId, Item) row is real data (e.g. it means "N copies
 * of this card in the deck" for a player deck like chel_start_deck), confirmed with the user, so entries stays a
 * plain array preserving every row and its original order.
 */
function normalizeDecksTable(table: ParsedTable, source: DeckSource): Deck[] {
    const deckIdColumn = findColumn(table.headers, ["DeckId"]);
    const itemColumn = findColumn(table.headers, ["Item"]);
    if (!deckIdColumn || !itemColumn) return [];

    const weightColumn = findColumn(table.headers, ["Weight"]);
    const costColumn = findColumn(table.headers, ["Cost"]);

    const order: string[] = [];
    const entriesByDeckId = new Map<string, DeckEntry[]>();
    let entrySeq = 0;

    for (const row of table.rows) {
        const deckId = (row[deckIdColumn] ?? "").trim();
        const itemId = (row[itemColumn] ?? "").trim();
        if (!deckId || !itemId) continue;

        if (!entriesByDeckId.has(deckId)) {
            entriesByDeckId.set(deckId, []);
            order.push(deckId);
        }
        entriesByDeckId.get(deckId)!.push({
            id: `${source}:${deckId}:${entrySeq++}`,
            itemId,
            weight: weightColumn ? parseOptionalNumber(row[weightColumn]) : undefined,
            cost: costColumn ? parseOptionalNumber(row[costColumn]) : undefined,
        });
    }

    return order.map((id) => ({ id, source, entries: entriesByDeckId.get(id)! }));
}

/**
 * Packs is the same row-per-group shape as Decks — one row per (PackId, SourceDeckId) entry, not one row per
 * pack. Confirmed with the user: Cost/ItemsToTake/UseWeights/AllowDuplicates are pack-level (read once, from the
 * first row of each group), while SourceDeckId/ItemNumber/ItemCount/ItemWeight/ItemCost are per-entry (one row
 * per source deck the pack pulls from — e.g. real start_deck has 3 rows, one per source deck). MetaTag is
 * captured but confirmed unused/read-only — never edited, never exported.
 */
function normalizePacksTable(table: ParsedTable): Pack[] {
    const packIdColumn = findColumn(table.headers, ["PackId"]);
    const sourceDeckColumn = findColumn(table.headers, ["SourceDeckId"]);
    if (!packIdColumn || !sourceDeckColumn) return [];

    const costColumn = findColumn(table.headers, ["Cost"]);
    const itemsToTakeColumn = findColumn(table.headers, ["ItemsToTake"]);
    const useWeightsColumn = findColumn(table.headers, ["UseWeights"]);
    const allowDuplicatesColumn = findColumn(table.headers, ["AllowDuplicates"]);
    const metaTagColumn = findColumn(table.headers, ["MetaTag"]);
    const itemNumberColumn = findColumn(table.headers, ["ItemNumber"]);
    const itemCountColumn = findColumn(table.headers, ["ItemCount"]);
    const itemWeightColumn = findColumn(table.headers, ["ItemWeight"]);
    const itemCostColumn = findColumn(table.headers, ["ItemCost"]);

    const order: string[] = [];
    const packsById = new Map<string, Pack>();
    let entrySeq = 0;

    for (const row of table.rows) {
        const packId = (row[packIdColumn] ?? "").trim();
        const sourceDeckId = (row[sourceDeckColumn] ?? "").trim();
        if (!packId || !sourceDeckId) continue;

        if (!packsById.has(packId)) {
            packsById.set(packId, {
                id: packId,
                cost: costColumn ? parseOptionalNumber(row[costColumn]) : undefined,
                itemsToTake: itemsToTakeColumn ? parseOptionalNumber(row[itemsToTakeColumn]) : undefined,
                useWeights: useWeightsColumn ? parseOptionalBoolean(row[useWeightsColumn]) : undefined,
                allowDuplicates: allowDuplicatesColumn ? parseOptionalBoolean(row[allowDuplicatesColumn]) : undefined,
                metaTag: metaTagColumn ? row[metaTagColumn]?.trim() || undefined : undefined,
                nameKey: packId,
                descKey: `${packId}_desc`,
                sources: [],
            });
            order.push(packId);
        }

        const entry: PackSourceEntry = {
            id: `Packs:${packId}:${entrySeq++}`,
            sourceDeckId,
            itemNumber: itemNumberColumn ? parseOptionalNumber(row[itemNumberColumn]) : undefined,
            itemCount: itemCountColumn ? parseOptionalNumber(row[itemCountColumn]) : undefined,
            itemWeight: itemWeightColumn ? parseOptionalNumber(row[itemWeightColumn]) : undefined,
            itemCost: itemCostColumn ? parseOptionalNumber(row[itemCostColumn]) : undefined,
        };
        packsById.get(packId)!.sources.push(entry);
    }

    return order.map((id) => packsById.get(id)!);
}

/** Balls is a flat row-per-object table, like Items — no grouping. Id column is "ItemId" (see the classifier's
 *  hazard note: this collides with the generic id-column path, hence Balls' own early classifier branch). */
function normalizeBallsTable(table: ParsedTable): Ball[] {
    const idColumn = findColumn(table.headers, ["ItemId", "Id"]);
    if (!idColumn) return [];

    const runMinColumn = findColumn(table.headers, ["RunMin"]);
    const runMaxColumn = findColumn(table.headers, ["RunMax"]);
    const inertiaMinColumn = findColumn(table.headers, ["InertiaMin"]);
    const inertiaMaxColumn = findColumn(table.headers, ["InertiaMax"]);
    const valueMinColumn = findColumn(table.headers, ["ValueMin"]);
    const valueMaxColumn = findColumn(table.headers, ["ValueMax"]);
    const colorColumn = findColumn(table.headers, ["Color"]);
    const metaTagColumn = findColumn(table.headers, ["MetaTag"]);

    return table.rows
        .filter((row) => (row[idColumn] ?? "").trim() !== "")
        .map((row): Ball => {
            const id = row[idColumn].trim();
            return {
                id,
                runMin: runMinColumn ? parseOptionalNumber(row[runMinColumn]) : undefined,
                runMax: runMaxColumn ? parseOptionalNumber(row[runMaxColumn]) : undefined,
                inertiaMin: inertiaMinColumn ? parseOptionalNumber(row[inertiaMinColumn]) : undefined,
                inertiaMax: inertiaMaxColumn ? parseOptionalNumber(row[inertiaMaxColumn]) : undefined,
                valueMin: valueMinColumn ? parseOptionalNumber(row[valueMinColumn]) : undefined,
                valueMax: valueMaxColumn ? parseOptionalNumber(row[valueMaxColumn]) : undefined,
                color: colorColumn ? row[colorColumn]?.trim() || undefined : undefined,
                metaTag: metaTagColumn ? row[metaTagColumn]?.trim() || undefined : undefined,
                nameKey: id,
                descKey: `${id}_desc`,
            };
        });
}

/**
 * BallGroups is one wide row per group (up to 7 "Ball" slots as same-named repeated columns), NOT the narrow
 * row-per-entry shape Decks/DecksShop use — structurally the same as normalizeUpgradeChainsTable's tier columns
 * (or RoundSettings' own DeckBalls columns), just with a "Ball" prefix instead of "UpgradeId"/"DeckBalls".
 */
function normalizeBallGroupsTable(table: ParsedTable): BallGroup[] {
    const deckIdColumn = findColumn(table.headers, ["DeckId"]);
    if (!deckIdColumn) return [];

    const ballColumns = table.headers
        .filter((header) => /^Ball(_\d+)?$/i.test(header.trim()))
        .sort((a, b) => numericSuffix(a) - numericSuffix(b));

    return table.rows
        .filter((row) => (row[deckIdColumn] ?? "").trim() !== "")
        .map((row): BallGroup => ({
            id: row[deckIdColumn].trim(),
            ballIds: ballColumns
                .map((column) => row[column]?.trim())
                .filter((value): value is string => Boolean(value)),
        }));
}

/**
 * Sprints combines both shapes above: narrow row-per-(SprintId, RoundNumber) entry, like Decks/Packs (grouped by
 * SprintId, one array entry per row), AND each row has its own wide repeated `RoundSettings` columns (up to 9,
 * literally same-named in the real sheet), like BallGroups' `Ball` columns — just harvested per-row instead of
 * once-per-group. `RoundNumber` itself is read only to SORT each group's rows into the right order, then
 * discarded — confirmed with the user it's purely derived from row position ("автоматически подставляется"), so
 * from here on array order alone is the source of truth (see Sprint.rounds' doc). `PacksDeck`/`Shops` columns are
 * real but confirmed out of scope with the user — deliberately never looked up here.
 */
function normalizeSprintsTable(table: ParsedTable): Sprint[] {
    const sprintIdColumn = findColumn(table.headers, ["SprintId"]);
    if (!sprintIdColumn) return [];

    const roundNumberColumn = findColumn(table.headers, ["RoundNumber"]);
    const quotaColumn = findColumn(table.headers, ["Quota"]);
    const stageColumn = findColumn(table.headers, ["Stage"]);
    const rewardTicketsColumn = findColumn(table.headers, ["RewardTickerts"]);
    const rewardTicketsPerBallColumn = findColumn(table.headers, ["RewardTicketsPerBall"]);
    const rewardPackColumn = findColumn(table.headers, ["RewardPack"]);
    const housesInShopColumn = findColumn(table.headers, ["HousesInShop"]);
    const packDeckStartColumn = findColumn(table.headers, ["PackDeckStart"]);

    const roundSettingsColumns = table.headers
        .filter((header) => /^RoundSettings(_\d+)?$/i.test(header.trim()))
        .sort((a, b) => numericSuffix(a) - numericSuffix(b));

    const order: string[] = [];
    const roundsBySprintId = new Map<string, { round: SprintRound; roundNumber: number }[]>();
    let entrySeq = 0;

    for (const row of table.rows) {
        const sprintId = (row[sprintIdColumn] ?? "").trim();
        if (!sprintId) continue;

        if (!roundsBySprintId.has(sprintId)) {
            roundsBySprintId.set(sprintId, []);
            order.push(sprintId);
        }

        const round: SprintRound = {
            id: `Sprints:${sprintId}:${entrySeq++}`,
            quota: quotaColumn ? parseOptionalNumber(row[quotaColumn]) : undefined,
            stage: stageColumn ? parseOptionalNumber(row[stageColumn]) : undefined,
            rewardTickets: rewardTicketsColumn ? parseOptionalNumber(row[rewardTicketsColumn]) : undefined,
            rewardTicketsPerBall: rewardTicketsPerBallColumn
                ? parseOptionalNumber(row[rewardTicketsPerBallColumn])
                : undefined,
            rewardPackId: rewardPackColumn ? row[rewardPackColumn]?.trim() || undefined : undefined,
            housesInShopPackId: housesInShopColumn ? row[housesInShopColumn]?.trim() || undefined : undefined,
            packDeckStartId: packDeckStartColumn ? row[packDeckStartColumn]?.trim() || undefined : undefined,
            roundIds: roundSettingsColumns
                .map((column) => row[column]?.trim())
                .filter((value): value is string => Boolean(value)),
        };

        const roundNumber = roundNumberColumn ? (parseOptionalNumber(row[roundNumberColumn]) ?? 0) : 0;
        roundsBySprintId.get(sprintId)!.push({ round, roundNumber });
    }

    return order.map((id) => ({
        id,
        rounds: roundsBySprintId
            .get(id)!
            .sort((a, b) => a.roundNumber - b.roundNumber)
            .map((entry) => entry.round),
    }));
}

function normalizeMechanicTable(table: ParsedTable, type: MechanicTableName): MechanicRow[] {
    const idColumn = findColumn(table.headers, ["ItemId", "Id"]);
    if (!idColumn) return [];

    return table.rows
        .filter((row) => (row[idColumn] ?? "").trim() !== "")
        .map((row, index): MechanicRow => {
            const fields: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
                if (key === idColumn) continue;
                if (value !== undefined && value !== "") {
                    fields[key] = value;
                }
            }

            return {
                id: `${type}:${row[idColumn].trim()}:${index}`,
                table: type,
                itemId: row[idColumn].trim(),
                fields,
            };
        });
}

function normalizeReplaceRuleTable(table: ParsedTable, source: ReplaceRuleSource): ReplaceRule[] {
    const fromColumn = findColumn(table.headers, ["ItemIdToReplace"]);
    const toColumn = findColumn(table.headers, ["ReplacementItem"]);
    if (!fromColumn || !toColumn) return [];

    return table.rows
        .filter((row) => (row[fromColumn] ?? "").trim() !== "" && (row[toColumn] ?? "").trim() !== "")
        .map((row, index): ReplaceRule => {
            const fields: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
                if (key === fromColumn || key === toColumn) continue;
                if (value !== undefined && value !== "") fields[key] = value;
            }

            return {
                id: `${source}:${row[fromColumn].trim()}:${index}`,
                source,
                itemIdToReplace: row[fromColumn].trim(),
                replacementItem: row[toColumn].trim(),
                fields,
            };
        });
}

/**
 * The Enums sheet lists valid values per parameter dimension as independent,
 * ragged columns (one column per dimension, N unrelated values stacked down
 * it) — not a normal row-per-record table. Columns with no header (used for
 * human-readable labels alongside another column) are skipped.
 */
function normalizeEnumsTable(table: ParsedTable): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const header of table.headers) {
        const dimension = header.trim();
        if (!dimension) continue;

        const values = new Set<string>();
        for (const row of table.rows) {
            const value = row[header]?.trim();
            if (value) values.add(value);
        }

        if (values.size > 0) result[dimension] = [...values].sort();
    }

    return result;
}

function mergeEnumValues(target: Record<string, string[]>, incoming: Record<string, string[]>): void {
    for (const [dimension, values] of Object.entries(incoming)) {
        const set = new Set([...(target[dimension] ?? []), ...values]);
        target[dimension] = [...set].sort();
    }
}

export function normalizeClassifiedTables(classified: ClassifiedTable[]): {
    data: NormalizedData;
    warnings: ImportWarning[];
} {
    const items: Item[] = [];
    const translations: Translation[] = [];
    const mechanics: MechanicRow[] = [];
    const upgradeChains: UpgradeChain[] = [];
    const rounds: Round[] = [];
    const decks: Deck[] = [];
    const packs: Pack[] = [];
    const balls: Ball[] = [];
    const ballGroups: BallGroup[] = [];
    const sprints: Sprint[] = [];
    const replaceRules: ReplaceRule[] = [];
    const enumValues: Record<string, string[]> = {};
    const warnings: ImportWarning[] = [];

    for (const { type, table } of classified) {
        if (type === "Items") {
            const normalized = normalizeItemsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдена колонка ItemId — таблица предметов пропущена",
                });
            }
            items.push(...normalized);
        } else if (type === "Translations") {
            const normalized = normalizeTranslationsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдены колонки key/value(ru/en) — таблица переводов пропущена",
                });
            }
            translations.push(...normalized);
        } else if (type === "UpgradeChains") {
            const normalized = normalizeUpgradeChainsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдена колонка UpgradeChainId — таблица цепочек прокачки пропущена",
                });
            }
            upgradeChains.push(...normalized);
        } else if (type === "RoundSettings") {
            const normalized = normalizeRoundSettingsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдена колонка RoundId — таблица раундов пропущена",
                });
            }
            rounds.push(...normalized);
        } else if (type === "Decks" || type === "DecksShop") {
            const normalized = normalizeDecksTable(table, type);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдены колонки DeckId/Item — таблица колод пропущена",
                });
            }
            decks.push(...normalized);
        } else if (type === "Packs") {
            const normalized = normalizePacksTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдены колонки PackId/SourceDeckId — таблица паков пропущена",
                });
            }
            packs.push(...normalized);
        } else if (type === "Balls") {
            const normalized = normalizeBallsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдена колонка ItemId — таблица шаров пропущена",
                });
            }
            balls.push(...normalized);
        } else if (type === "BallGroups") {
            const normalized = normalizeBallGroupsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдена колонка DeckId — таблица колод шаров пропущена",
                });
            }
            ballGroups.push(...normalized);
        } else if (type === "Sprints") {
            const normalized = normalizeSprintsTable(table);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдена колонка SprintId — таблица забегов пропущена",
                });
            }
            sprints.push(...normalized);
        } else if (type === "ReplaceItem" || type === "ReplaceOnTrigger") {
            const normalized = normalizeReplaceRuleTable(table, type);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не найдены колонки ItemIdToReplace/ReplacementItem — таблица замен пропущена",
                });
            }
            replaceRules.push(...normalized);
        } else if (type === "Enums") {
            mergeEnumValues(enumValues, normalizeEnumsTable(table));
        } else if (type === "Unknown") {
            if (!isIntentionallyUnsupportedTable(table.sourceName)) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: "Не удалось определить тип таблицы — данные не загружены",
                });
            }
        } else {
            const normalized = normalizeMechanicTable(table, type);
            if (normalized.length === 0) {
                warnings.push({
                    sourceName: table.sourceName,
                    message: `Таблица ${type}: не найдена колонка ItemId`,
                });
            }
            mechanics.push(...normalized);
        }
    }

    // Multiple raw tables can classify as "Items" (Cards/Houses/Artefacts, and occasionally a misclassified one —
    // a real production sheet had a "MechAddValue (копия)" tab wrongly detected as Items) with no guarantee their
    // ItemIds are disjoint. Left undeduplicated, this doesn't fail loudly — it silently breaks React's key-based
    // reconciliation on any page that lists items (stale cards, items appearing in the wrong position after a
    // re-sort), which looks like an unrelated rendering bug rather than a duplicate-data problem. Last entry
    // wins, same "later write overwrites earlier" convention as GameStore's mergeById.
    const dedupedItems = [...new Map(items.map((item) => [item.id, item])).values()];
    if (dedupedItems.length !== items.length) {
        warnings.push({
            sourceName: "Items",
            message: `Найдено ${items.length - dedupedItems.length} предмет(ов) с повторяющимся ItemId в разных таблицах — оставлена последняя запись для каждого`,
        });
    }

    return {
        data: {
            items: dedupedItems,
            translations,
            mechanics,
            upgradeChains,
            rounds,
            decks,
            packs,
            balls,
            ballGroups,
            sprints,
            replaceRules,
            enumValues,
        },
        warnings,
    };
}
