import type { Item } from "./models/Item";
import type { Build } from "./models/Build";
import type { Translation } from "./models/Translation";
import type { MechanicRow, MechanicTableName } from "./models/Mechanic";
import type { UpgradeChain } from "./models/UpgradeChain";
import type { Round } from "./models/Round";
import type { Deck, DeckSource } from "./models/Deck";
import type { Pack, PackSourceEntry } from "./models/Pack";
import type { Ball } from "./models/Ball";
import type { BallGroup } from "./models/BallGroup";
import type { Sprint } from "./models/Sprint";
import type { Shop } from "./models/Shop";
import type { ReplaceRule } from "./models/ReplaceRule";
import type { GlossaryEntry } from "./models/GlossaryEntry";
import type { TagIcon } from "./models/TagIcon";
import type { BalanceSaveMeta, BalanceSavePayload } from "./models/BalanceSave";
import { DEFAULT_BALANCE_CONFIG, type BalanceConfig } from "./models/BalanceConfig";

import { ItemService } from "./services/ItemService";
import { BuildService } from "./services/BuildService";
import { ImportService, type ImportReport, type ImportResult } from "./services/ImportService";

import { computeSuggestedBuilds, computeCascadeBuilds, computeUpgradeTierIds } from "./domain/relations";
import { PLACEHOLDER_ITEM_ICON } from "./domain/sprites";
import { deriveParamValues, mergeParamValueSources } from "./domain/paramRegistry";
import { DEFAULT_DESCRIPTION_SETTINGS, getEnabledGlossaryEntries, type DescriptionSettings } from "./domain/descriptionTemplate";
import { DEFAULT_CONTENT_SETTINGS, type ContentSettings } from "./domain/idRules";
import { buildExportDescriptionText } from "./domain/exportText";
import { buildImportDescriptionText } from "./domain/importText";
import { postExportPayload, type ExportResult, type MechanicRowUpdate } from "./import/sheetSource";
import { MECHANIC_TABLE_COLUMNS } from "./domain/mechanicTables";
import { parseOptionalNumber } from "./import/normalize";

import {
    loadImportCache,
    saveImportCache,
    readLegacyLocalState,
    isMigratedToFirestore,
    markMigratedToFirestore,
    exportSnapshot as writeSnapshotFile,
    parseSnapshotFile,
    getLastSavedBalanceSnapshot,
    saveLastSavedBalanceSnapshot,
    type SourceUrls,
} from "./persistence/localStore";

import {
    subscribeBuilds,
    subscribeShared,
    writeBuild,
    deleteBuildDoc,
    writeBuildsBatch,
    deleteBuildsBatch,
    addItemToBuildRemote,
    removeItemFromBuildRemote,
    linkBuildsRemote,
    unlinkBuildsRemote,
    updateItemIconRemote,
    updateDeckNameRemote,
    updateSprintStageCountRemote,
    addCustomParamValueRemote,
    updateSourceConfigUrlRemote,
    updateSourceTranslationsUrlRemote,
    updateDescriptionSettingsRemote,
    updateBalanceConfigRemote,
    updateTranslationOverrideRemote,
    replaceExportedOverridesRemote,
    replaceTranslationOverridesRemote,
    updateContentSettingsRemote,
    subscribeGlossary,
    replaceGlossaryRemote,
    subscribeTagIcons,
    replaceTagIconsRemote,
    subscribeSpecialRoundTypes,
    replaceSpecialRoundTypesRemote,
    replaceAllBuilds,
    replaceSharedState,
    migrateIfEmpty,
    subscribeBalanceSaves,
    createBalanceSaveRemote,
    fetchBalanceSavePayloadRemote,
    deleteBalanceSaveRemote,
} from "./persistence/firestoreStore";

/** Deterministic stringify (object keys sorted recursively, array order preserved) — used to compare a
 *  BalanceSavePayload against the current live state regardless of Firestore's map-field key ordering, which
 *  isn't guaranteed to round-trip identically to however the object was originally constructed locally. */
function canonicalStringify(value: unknown): string {
    return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value as Record<string, unknown>)
                .sort()
                .map((key) => [key, sortKeysDeep((value as Record<string, unknown>)[key])])
        );
    }
    return value;
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
    const map = new Map(existing.map((entry) => [entry.id, entry]));
    for (const entry of incoming) map.set(entry.id, entry);
    return [...map.values()];
}

/**
 * Mechanic columns that legitimately hold a different number on each upgrade tier — confirmed against the real
 * config, where these are the only fields that ever differ between a chain's tier rows (ActivationCount 1→2→3,
 * TargetCount 3→6→9). copyMechanicsToUpgrades keeps a tier's own value in these rather than overwriting it.
 */
const PER_TIER_MECHANIC_COLUMNS = ["ActivationCount", "TargetCount", "Duration", "Chance"];

/** CardUpgrades is `UpgradeChainId,UpgradeId1..3` in the real sheet — a shorter chain blanks the leftover cells. */
const UPGRADE_ID_COLUMN_COUNT = 3;

/**
 * Drops manual icons whose value is just the placeholder. Saving one was possible until now (the icon editor
 * pre-filled 🧩 and wrote it straight back), and the result looked like a bug rather than a choice: a stored
 * manual icon wins over the item's real sprite, so the item rendered 🧩 — pixel-identical to "sprite missing" —
 * while its upgrade tiers, which had no such entry, showed the sprite fine. Cleaned on the way in so existing
 * entries stop hiding sprites without needing a data migration; every consumer reads this map or getItemIcon().
 */
function normalizeItemIcons(icons: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(icons).filter(([, icon]) => icon.trim() !== PLACEHOLDER_ITEM_ICON));
}

function mergeByKey(existing: Translation[], incoming: Translation[]): Translation[] {
    const map = new Map(existing.map((entry) => [entry.key, entry]));
    for (const entry of incoming) map.set(entry.key, entry);
    return [...map.values()];
}

export class GameStore {

    /** Every item seen from a config import, regardless of whether it has a translation. */
    allItems: Item[] = [];

    translations: Translation[] = [];

    mechanics: MechanicRow[] = [];

    upgradeChains: UpgradeChain[] = [];

    rounds: Round[] = [];

    decks: Deck[] = [];

    packs: Pack[] = [];

    balls: Ball[] = [];

    ballGroups: BallGroup[] = [];

    sprints: Sprint[] = [];

    /** ShopSettings rows, grouped by ShopId. A round points at one of these via its Sprint's `Shops` column. */
    shops: Shop[] = [];

    replaceRules: ReplaceRule[] = [];

    enumValues: Record<string, string[]> = {};

    /** Synced live from Firestore's `builds` collection — see initRemoteSync(). */
    builds: Build[] = [];

    itemIcons: Record<string, string> = {};

    /** Site-only deck/ball-deck display names, keyed by deck id — pure editing convenience, NEVER exported to
     *  Google Sheets. See setDeckName/getDeckName and firestoreStore's SharedState.deckNames. */
    deckNames: Record<string, string> = {};

    /** Site-only sprint stage-count overrides, keyed by sprint id — see getSprintStageCount/setSprintStageCount
     *  and firestoreStore's SharedState.sprintStageCounts. */
    sprintStageCounts: Record<string, number> = {};

    customParamValues: Record<string, string[]> = {};

    sources: SourceUrls = { configUrl: "", translationsUrl: "" };

    descriptionSettings: DescriptionSettings = DEFAULT_DESCRIPTION_SETTINGS;

    /** Depth coefficients + balance constants — see BalancePage's "Константы" tab and domain/balance.ts. */
    balanceConfig: BalanceConfig = DEFAULT_BALANCE_CONFIG;

    /** Editor-only authoring preferences (id rules) — see domain/idRules.ts. */
    contentSettings: ContentSettings = DEFAULT_CONTENT_SETTINGS;

    /**
     * Items created on the site that the sheet has never seen. Only these can be renamed: the id is the key every
     * table joins on, so once a row exists in the sheet under that id, changing it here would orphan the sheet row
     * rather than rename it. Cleared per id on a successful export and on any import that brings the id back.
     */
    locallyCreatedItemIds: Set<string> = new Set();

    /** User-edited name/description text, keyed by translation key — wins over the imported translations table
     *  for the same key. See getTranslation()/setTranslationOverride(). */
    translationOverrides: Record<string, string> = {};

    /** Snapshot of translationOverrides as of the last successful Sheets export — see pendingExportCount. */
    exportedOverrides: Record<string, string> = {};

    /** Item ids touched via upsertItem (content editing) since the last successful exportContentChanges() —
     *  in-memory only, not persisted/synced, matching the lab's own "nothing survives a reload" framing. */
    dirtyItemIds: Set<string> = new Set();

    /**
     * itemId -> that item's raw columns exactly as imported, captured the first time it's edited. The export
     * diffs against this and sends only the columns that actually changed: rewriting a whole row re-triggers the
     * sheet's data validation on cells nobody touched, and a value that no longer satisfies its rule (a sprite
     * name dropped from the sprite list, say) aborts the whole export mid-way. Absent for items created on the
     * site — those have no sheet row yet, so every column has to be written.
     */
    originalItemRaw: Map<string, Record<string, string>> = new Map();

    /** MechanicRow ids upserted via upsertMechanicRow (content editing) since the last successful
     *  exportContentChanges() — brand-new rows, exported by appending to the sheet. */
    newMechanicRowIds: Set<string> = new Set();

    /** Ids of *already-existing* (imported) mechanic rows edited via updateMechanicRowFields since the last
     *  successful exportContentChanges() — exported as in-place updates, see that method's doc. */
    editedMechanicRowIds: Set<string> = new Set();

    /** rowId -> that row's field values exactly as imported, captured on its first edit. Sent alongside an
     *  in-place mechanic update so the Apps Script side can verify it's about to overwrite the row it thinks
     *  it is, and refuse (reporting a conflict) rather than silently clobbering a row someone else moved. */
    originalMechanicFields: Map<string, Record<string, string>> = new Map();

    /** Sheet-backed mechanic rows removed on the site, kept so the export can delete them there too. Identified
     *  the same way an in-place update is (ItemId + ordinal, guarded by the as-imported values). */
    deletedMechanicRows: { table: string; itemId: string; ordinal: number; originalFields: Record<string, string> }[] = [];

    /** Counter behind site-generated mechanic row ids — only needs to be unique within this session. */
    private nextRowSeq = 1;

    /** Upgrade-chain ids edited since the last successful exportContentChanges() — one CardUpgrades row each. */
    dirtyUpgradeChainIds: Set<string> = new Set();

    /** ItemIdToReplace values whose replace rules changed — the export rewrites all of that item's rows at once,
     *  which is also how a deleted rule disappears (there's no per-row delete signal). */
    dirtyReplaceSourceIds: Set<string> = new Set();

    /** Deck ids created/edited via upsertDeck (Decks page) since the last successful exportDeckChanges() —
     *  in-memory only, not persisted/synced, same "nothing survives a reload" framing as the content-editing sets
     *  above. Independent of dirtyItemIds/newMechanicRowIds — a separate export flow/button. */
    blueprintDirtyDeckIds: Set<string> = new Set();

    /** Deck id -> which table it came from, for decks removed via deleteDeck since the last successful
     *  exportDeckChanges() — kept here because once a deck is filtered out of `decks`, there's no other way to
     *  know which sheet (Decks vs DecksShop) to tell "clear this DeckId's rows" on export. */
    blueprintDeletedDecks: Map<string, DeckSource> = new Map();

    /** Ball-group ids created/edited via upsertBallGroup ("Колоды шаров" tab) since the last successful
     *  exportDeckChanges() — folded into the SAME export flow/button/count as Decks/DecksShop, since the user
     *  framed ball decks as just a third tab in the same section, not a separate page. */
    blueprintDirtyBallGroupIds: Set<string> = new Set();

    /** Ball-group ids removed via deleteBallGroup — simpler than blueprintDeletedDecks (only one target sheet). */
    blueprintDeletedBallGroupIds: Set<string> = new Set();

    /** Pack ids created/edited via upsertPack (Packs page) since the last successful exportPackChanges() — same
     *  in-memory-only framing as the Deck/content-editing sets above. Independent export flow/button. */
    blueprintDirtyPackIds: Set<string> = new Set();

    /** Pack ids removed via deletePack since the last successful exportPackChanges() — simpler than
     *  blueprintDeletedDecks (no source-table lookup needed, Packs has only one target sheet). */
    blueprintDeletedPackIds: Set<string> = new Set();

    /** Shop ids created/edited via upsertShop («Магазины») since the last successful exportShopChanges() — same
     *  in-memory-only framing as the Pack/Deck sets above. Independent export flow/button. */
    dirtyShopIds: Set<string> = new Set();

    /** Shop ids removed via deleteShop — exported as "clear every row for this ShopId". */
    deletedShopIds: Set<string> = new Set();

    /** Ball ids created/edited via upsertBall (Balls page) since the last successful exportBallChanges() — same
     *  in-memory-only framing as Pack/Deck above. Independent export flow/button. */
    blueprintDirtyBallIds: Set<string> = new Set();

    /** Round ids edited via updateRoundFields (RoundDetailPage) since the last successful exportRoundChanges() —
     *  same in-memory-only framing as the other dirty sets above. No create/delete — rounds are only ever edited,
     *  never created or removed on the site. */
    blueprintDirtyRoundIds: Set<string> = new Set();

    /** Ball ids removed via deleteBall since the last successful exportBallChanges(). */
    blueprintDeletedBallIds: Set<string> = new Set();

    /** Sprint ids created/edited via upsertSprint (Sprints page) since the last successful exportSprintChanges() —
     *  same in-memory-only framing as Pack/Deck/Ball above. Independent export flow/button. */
    blueprintDirtySprintIds: Set<string> = new Set();

    /** Sprint ids removed via deleteSprint — simple Set like blueprintDeletedPackIds/BallIds (only one target
     *  sheet, no source-table lookup needed). */
    blueprintDeletedSprintIds: Set<string> = new Set();

    /** Manually-curated "description phrase -> icon/emoji" entries — see GlossaryPage and the "icons-emoji"
     *  description mode. Synced independently of the other shared/* docs — see initRemoteSync(). */
    glossary: GlossaryEntry[] = [];

    /** Manually-curated "tag -> icon" entries, used to resolve `{tag:Name}` tokens inserted into descriptions —
     *  see GlossaryPage's "Иконки тегов" tab and descriptionTemplate.ts. Synced independently, like glossary. */
    tagIcons: TagIcon[] = [];

    /** Manually-curated list of valid "Спец. раунд" (RoundRules) values — starts empty, user-managed via
     *  SpecialRoundTypesPopover on RoundDetailPage. Synced independently, like glossary/tagIcons. */
    specialRoundTypes: string[] = [];

    /** Named point-in-time balance saves — metadata only (see SavesPage). Payload fetched on demand when restoring. */
    balanceSaves: BalanceSaveMeta[] = [];

    /** False until the first Firestore `builds` snapshot arrives — distinguishes "still loading" from "no builds yet". */
    buildsReady = false;

    /** False until the first Firestore `shared/*` snapshot arrives. */
    sharedReady = false;

    /** False until the first Firestore `shared/glossary` snapshot arrives. */
    glossaryReady = false;

    /** False until the first Firestore `shared/tagIcons` snapshot arrives. */
    tagIconsReady = false;

    /** False until the first Firestore `shared/specialRoundTypes` snapshot arrives. */
    specialRoundTypesReady = false;

    /** False until the first Firestore `balanceSaves` snapshot arrives. */
    balanceSavesReady = false;

    importReport: ImportReport | null = null;

    importError: string | null = null;

    importing = false;

    importedAt: string | null = null;

    /** Bumped on every mutation; read by useStore() via useSyncExternalStore. */
    version = 0;

    /**
     * Derived from allItems/translations by rebuildDerivedCaches(), called only where those two arrays are
     * reassigned (constructor, applyImportResult, importSnapshot) — NOT recomputed on every access. `items` used
     * to be a getter that re-filtered allItems against translations (an O(items × translations) linear scan via
     * .some()) on every single call, from inside render-path loops (once per rendered item icon, once per build
     * member, ...) — see project memory for that perf investigation. The filter itself is gone now (every config
     * item shows regardless of translation, see rebuildDerivedCaches), so `items`/`allItems` are the same array
     * today — `_itemsById` is kept as a cache purely so getItem() stays O(1) instead of rebuilding the Map (or
     * doing a linear find) on every call.
     */
    private _itemsById: Map<string, Item> = new Map();
    private _translationsByKey: Map<string, Translation> = new Map();

    readonly itemService = new ItemService();

    readonly buildService = new BuildService();

    readonly importService = new ImportService();

    private listeners = new Set<() => void>();

    constructor() {
        const cache = loadImportCache();
        this.importedAt = cache.importCacheTimestamp;

        if (cache.importCache) {
            this.allItems = cache.importCache.items;
            this.translations = cache.importCache.translations;
            this.mechanics = cache.importCache.mechanics;
            this.upgradeChains = cache.importCache.upgradeChains ?? [];
            this.rounds = cache.importCache.rounds ?? [];
            this.decks = cache.importCache.decks ?? [];
            this.packs = cache.importCache.packs ?? [];
            this.balls = cache.importCache.balls ?? [];
            this.ballGroups = cache.importCache.ballGroups ?? [];
            this.sprints = cache.importCache.sprints ?? [];
            this.shops = cache.importCache.shops ?? [];
            this.replaceRules = cache.importCache.replaceRules ?? [];
            this.enumValues = cache.importCache.enumValues ?? {};
        }

        this.rebuildDerivedCaches();
        this.initRemoteSync();
    }

    /** Recomputes itemsById/translationsByKey from allItems/translations — call after reassigning either. */
    private rebuildDerivedCaches(): void {
        this._translationsByKey = new Map(this.translations.map((translation) => [translation.key, translation]));
        this._itemsById = new Map(this.allItems.map((item) => [item.id, item]));
    }

    /** Subscribes to Firestore for the lifetime of the app — this store is a page-lifetime singleton, never disposed. */
    private initRemoteSync(): void {
        subscribeBuilds((builds) => {
            this.builds = builds;
            this.buildsReady = true;
            this.notify();
        });

        subscribeShared((shared, ready) => {
            this.itemIcons = normalizeItemIcons(shared.itemIcons);
            this.deckNames = shared.deckNames;
            this.sprintStageCounts = shared.sprintStageCounts;
            this.customParamValues = shared.customParamValues;
            this.sources = shared.sources;
            this.descriptionSettings = shared.descriptionSettings;
            this.translationOverrides = shared.translationOverrides;
            this.exportedOverrides = shared.exportedOverrides;
            this.balanceConfig = shared.balanceConfig;
            this.contentSettings = shared.contentSettings;
            // Only once EVERY underlying shared/* doc has delivered its first snapshot — not just whichever one
            // happened to arrive first — so a sharedReady-gated one-time form remount (ConstantsTab, SettingsPage)
            // never seeds itself from a field that hasn't actually loaded yet. See subscribeShared's own doc.
            if (ready) this.sharedReady = true;
            this.notify();
        });

        subscribeGlossary((entries) => {
            this.glossary = entries;
            this.glossaryReady = true;
            this.notify();
        });

        subscribeTagIcons((entries) => {
            this.tagIcons = entries;
            this.tagIconsReady = true;
            this.notify();
        });

        subscribeSpecialRoundTypes((values) => {
            this.specialRoundTypes = values;
            this.specialRoundTypesReady = true;
            this.notify();
        });

        subscribeBalanceSaves((saves) => {
            this.balanceSaves = saves;
            this.balanceSavesReady = true;
            this.notify();
        });
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private notify(): void {
        this.version += 1;
        this.listeners.forEach((listener) => listener());
    }

    get paramValues(): Record<string, string[]> {
        return mergeParamValueSources(
            deriveParamValues(this.items, this.mechanics),
            this.enumValues,
            this.customParamValues
        );
    }

    /** Every config item, regardless of whether it has a matching translation. */
    get items(): Item[] {
        return this.allItems;
    }

    getItem(id: string): Item | undefined {
        return this._itemsById.get(id);
    }

    getRound(id: string): Round | undefined {
        return this.rounds.find((round) => round.id === id);
    }

    getDeck(id: string): Deck | undefined {
        return this.decks.find((deck) => deck.id === id);
    }

    getPack(id: string): Pack | undefined {
        return this.packs.find((pack) => pack.id === id);
    }

    getBall(id: string): Ball | undefined {
        return this.balls.find((ball) => ball.id === id);
    }

    getBallGroup(id: string): BallGroup | undefined {
        return this.ballGroups.find((group) => group.id === id);
    }

    getSprint(id: string): Sprint | undefined {
        return this.sprints.find((sprint) => sprint.id === id);
    }

    /**
     * The content editor's write path: creates the item if `itemId` doesn't exist yet, otherwise merges `patch`
     * into the existing one — same "upsert by id" semantics the Apps Script side will use when exporting, so a
     * brand-new drafted item and an edited real one are exactly the same case here. `patch.raw` is merged
     * shallowly into the item's existing raw bag (untouched real columns — sprite names, RarityVFX, etc. — survive
     * even though the lab's UI doesn't model every column). `patch.tags`, when given, also overwrites raw.Tags
     * (comma-joined) so the two stay in sync, matching how normalizeItemsTable derives one from the other on import.
     */
    upsertItem(itemId: string, itemType: string, patch: { tags?: string[]; raw?: Record<string, string> }): void {
        const trimmedId = itemId.trim();
        if (!trimmedId) return;

        const existing = this.getItem(trimmedId);
        const tags = patch.tags ?? existing?.tags ?? [];
        const raw: Record<string, string> = { ...(existing?.raw ?? {}), ItemId: trimmedId, ...(patch.raw ?? {}) };
        if (patch.tags) raw.Tags = tags.join(", ");

        const next: Item = {
            id: trimmedId,
            itemType,
            tags,
            icon: existing?.icon,
            nameKey: existing?.nameKey ?? trimmedId,
            descKey: existing?.descKey ?? `${trimmedId}_desc`,
            valueMin: parseOptionalNumber(raw.ValueMin),
            valueMax: parseOptionalNumber(raw.ValueMax),
            raw,
        };

        // The lab re-derives and re-pushes every visible node on any canvas change (including just dragging a
        // node around), so bail out when nothing actually changed — otherwise every item would count as a
        // pending export forever and each export would rewrite untouched sheet rows.
        if (existing && canonicalStringify(existing) === canonicalStringify(next)) return;

        // Created here, so the sheet has never seen it — that's what makes its id still renameable.
        if (!existing) this.locallyCreatedItemIds.add(trimmedId);
        // First edit of a sheet-backed item: remember how the row arrived, so the export can send just the diff.
        else if (!this.originalItemRaw.has(trimmedId) && !this.locallyCreatedItemIds.has(trimmedId)) {
            this.originalItemRaw.set(trimmedId, existing.raw);
        }

        this.allItems = mergeById(this.allItems, [next]);
        this.rebuildDerivedCaches();
        this.dirtyItemIds.add(trimmedId);
        this.notify();
    }

    /**
     * Upserts a mechanic row authored on the site (not loaded from real data) — finds an
     * existing row with the same (synthetic, `content:`-prefixed) id and replaces it, otherwise appends. Safe
     * to call on every keystroke while the canvas is being edited (idempotent by id, never duplicates a row).
     * Exported by appending a fresh sheet row — this id never corresponded to one (see exportContentChanges()).
     */
    upsertMechanicRow(row: MechanicRow): void {
        const existing = this.mechanics.find((r) => r.id === row.id);
        if (existing && canonicalStringify(existing) === canonicalStringify(row)) return;

        this.mechanics = existing ? this.mechanics.map((r) => (r.id === row.id ? row : r)) : [...this.mechanics, row];
        this.newMechanicRowIds.add(row.id);
        this.notify();
    }

    /**
     * Merges field edits into an already-existing (imported) mechanic row, and marks it for in-place export.
     * Captures the row's as-imported values the first time it's touched, so exportContentChanges() can prove
     * to the Apps Script side which sheet row it means (see originalMechanicFields).
     */
    updateMechanicRowFields(rowId: string, patch: Record<string, string>): void {
        const existing = this.mechanics.find((row) => row.id === rowId);
        if (!existing) return;

        const nextFields = { ...existing.fields, ...patch };
        // Same reasoning as upsertItem: the lab re-pushes every node on any canvas change, so only a real value
        // change should count as a pending export.
        if (canonicalStringify(existing.fields) === canonicalStringify(nextFields)) return;

        if (!this.originalMechanicFields.has(rowId)) {
            this.originalMechanicFields.set(rowId, { ...existing.fields });
        }
        this.mechanics = this.mechanics.map((row) => (row.id === rowId ? { ...row, fields: nextFields } : row));
        this.editedMechanicRowIds.add(rowId);
        this.notify();
    }

    /** Full-replace upsert for a whole deck (Decks page) — same "small list, full replace is simpler than
     *  point-update" precedent as setGlossary/setTagIcons, just per-deck instead of for the whole list. Marks the
     *  id dirty for exportDeckChanges() and un-marks it as deleted, in case this is re-creating a deck that was
     *  just removed locally. */
    upsertDeck(deck: Deck): void {
        this.decks = mergeById(this.decks, [deck]);
        this.blueprintDirtyDeckIds.add(deck.id);
        this.blueprintDeletedDecks.delete(deck.id);
        this.notify();
    }

    createDeck(id: string, source: DeckSource): void {
        const trimmedId = id.trim();
        if (!trimmedId || this.getDeck(trimmedId)) return;
        this.upsertDeck({ id: trimmedId, source, entries: [] });
    }

    /** Removes a deck locally and remembers which sheet it came from (blueprintDeletedDecks), so
     *  exportDeckChanges() can still tell the sheet to clear that DeckId's rows even though it's no longer in
     *  `decks` to look up. */
    deleteDeck(id: string): void {
        const existing = this.getDeck(id);
        if (!existing) return;
        this.blueprintDeletedDecks.set(id, existing.source);
        this.blueprintDirtyDeckIds.delete(id);
        this.decks = this.decks.filter((deck) => deck.id !== id);
        this.notify();
    }

    /** Full-replace upsert for a whole ball group ("Колоды шаров" tab) — same convention as upsertDeck. */
    upsertBallGroup(group: BallGroup): void {
        this.ballGroups = mergeById(this.ballGroups, [group]);
        this.blueprintDirtyBallGroupIds.add(group.id);
        this.blueprintDeletedBallGroupIds.delete(group.id);
        this.notify();
    }

    createBallGroup(id: string): void {
        const trimmedId = id.trim();
        if (!trimmedId || this.getBallGroup(trimmedId)) return;
        this.upsertBallGroup({ id: trimmedId, ballIds: [] });
    }

    deleteBallGroup(id: string): void {
        if (!this.getBallGroup(id)) return;
        this.blueprintDeletedBallGroupIds.add(id);
        this.blueprintDirtyBallGroupIds.delete(id);
        this.ballGroups = this.ballGroups.filter((group) => group.id !== id);
        this.notify();
    }

    /** Full-replace upsert for a whole pack (Packs page) — same convention as upsertDeck. */
    upsertPack(pack: Pack): void {
        this.packs = mergeById(this.packs, [pack]);
        this.blueprintDirtyPackIds.add(pack.id);
        this.blueprintDeletedPackIds.delete(pack.id);
        this.notify();
    }

    createPack(id: string): void {
        const trimmedId = id.trim();
        if (!trimmedId || this.getPack(trimmedId)) return;
        this.upsertPack({ id: trimmedId, nameKey: trimmedId, descKey: `${trimmedId}_desc`, sources: [] });
    }

    getShop(id: string): Shop | undefined {
        return this.shops.find((shop) => shop.id === id);
    }

    /** Full-replace upsert for a whole shop — same convention as upsertDeck/upsertPack. */
    upsertShop(shop: Shop): void {
        this.shops = mergeById(this.shops, [shop]);
        this.dirtyShopIds.add(shop.id);
        this.deletedShopIds.delete(shop.id);
        this.notify();
    }

    createShop(id: string): void {
        const trimmedId = id.trim();
        if (!trimmedId || this.getShop(trimmedId)) return;
        this.upsertShop({ id: trimmedId, housePacks: [], cardPacks: [] });
    }

    deleteShop(id: string): void {
        if (!this.getShop(id)) return;
        this.deletedShopIds.add(id);
        this.dirtyShopIds.delete(id);
        this.shops = this.shops.filter((shop) => shop.id !== id);
        this.notify();
    }

    get shopPendingExportCount(): number {
        return this.dirtyShopIds.size + this.deletedShopIds.size;
    }

    deletePack(id: string): void {
        if (!this.getPack(id)) return;
        this.blueprintDeletedPackIds.add(id);
        this.blueprintDirtyPackIds.delete(id);
        this.packs = this.packs.filter((pack) => pack.id !== id);
        this.notify();
    }

    /** Full-replace upsert for a whole ball (Balls page) — same convention as upsertPack. */
    upsertBall(ball: Ball): void {
        this.balls = mergeById(this.balls, [ball]);
        this.blueprintDirtyBallIds.add(ball.id);
        this.blueprintDeletedBallIds.delete(ball.id);
        this.notify();
    }

    createBall(id: string): void {
        const trimmedId = id.trim();
        if (!trimmedId || this.getBall(trimmedId)) return;
        this.upsertBall({ id: trimmedId, nameKey: trimmedId, descKey: `${trimmedId}_desc` });
    }

    deleteBall(id: string): void {
        if (!this.getBall(id)) return;
        this.blueprintDeletedBallIds.add(id);
        this.blueprintDirtyBallIds.delete(id);
        this.balls = this.balls.filter((ball) => ball.id !== id);
        this.notify();
    }

    /** Full-replace upsert for a whole sprint (Sprints page) — same convention as upsertPack/upsertBall. Round-
     *  entry-level edits (add/remove/move-between-stages) all go through this one call with the whole `rounds`
     *  array replaced, same "whole-array replace from the card" pattern as DeckCard.updateEntries. */
    upsertSprint(sprint: Sprint): void {
        this.sprints = mergeById(this.sprints, [sprint]);
        this.blueprintDirtySprintIds.add(sprint.id);
        this.blueprintDeletedSprintIds.delete(sprint.id);
        this.notify();
    }

    createSprint(id: string): void {
        const trimmedId = id.trim();
        if (!trimmedId || this.getSprint(trimmedId)) return;
        this.upsertSprint({ id: trimmedId, rounds: [] });
    }

    deleteSprint(id: string): void {
        if (!this.getSprint(id)) return;
        this.blueprintDeletedSprintIds.add(id);
        this.blueprintDirtySprintIds.delete(id);
        this.sprints = this.sprints.filter((sprint) => sprint.id !== id);
        this.notify();
    }

    /** Patches an existing round's editable fields (RoundDetailPage's rules/invisibleArtefactId/tempDeckId/
     *  deckBalls pickers) and marks it dirty for exportRoundChanges(). No create/delete counterpart — rounds are
     *  only ever edited on the site, never added or removed (unlike Decks/Packs/Balls above). */
    updateRoundFields(id: string, patch: Partial<Round>): void {
        const existing = this.getRound(id);
        if (!existing) return;
        this.rounds = this.rounds.map((round) => (round.id === id ? { ...round, ...patch } : round));
        this.blueprintDirtyRoundIds.add(id);
        this.notify();
    }

    getBuild(id: string): Build | undefined {
        return this.builds.find((build) => build.id === id);
    }

    buildsForItem(itemId: string): Build[] {
        return this.builds.filter((build) => build.items.includes(itemId));
    }

    chainForItem(itemId: string): UpgradeChain | undefined {
        return this.upgradeChains.find((chain) => chain.itemIds.includes(itemId));
    }

    getItemIcon(itemId: string): string | undefined {
        return this.itemIcons[itemId];
    }

    /** A user-edited override (see setTranslationOverride) wins over whatever the imported translations table
     *  has for the same key — lets names/descriptions be authored on the site itself, ahead of the sheet. `||`
     *  (not `??`) since a cleared override is stored as `""`, which should fall through to the real translation
     *  just like an override that was never set at all. */
    getTranslation(key: string | undefined): string | undefined {
        if (!key) return undefined;
        return this.translationOverrides[key] || this._translationsByKey.get(key)?.value;
    }

    /** Point-update, like setItemIcon — two people editing different items' names/descriptions never clobber
     *  each other. Passing "" clears back to whatever the imported translations table has for this key. */
    setTranslationOverride(key: string, value: string): void {
        if (value) {
            this.translationOverrides = { ...this.translationOverrides, [key]: value };
        } else {
            const next = { ...this.translationOverrides };
            delete next[key];
            this.translationOverrides = next;
        }
        this.notify();
        void updateTranslationOverrideRemote(key, value).catch((error) =>
            console.error("setTranslationOverride → Firestore", error)
        );
    }

    /** How many overrides differ from what was last successfully exported — a key whose current value matches
     *  exportedOverrides[key] has already been sent and doesn't count, even though it's still an active override
     *  (getTranslation() keeps using it — exporting doesn't clear the site's own copy, only marks it as sent). */
    get pendingExportCount(): number {
        return Object.entries(this.translationOverrides).filter(([key, value]) => this.exportedOverrides[key] !== value)
            .length;
    }

    /**
     * Sends every site-edited name/description (not the full 424-item catalog — only what was actually touched
     * via setTranslationOverride) to the Apps Script's doPost endpoint — covers items and packs (both
     * name+description) and round descriptions (see Round.descKey/RoundDetailPage; rounds have no editable
     * name). Descriptions run through buildExportDescriptionText first, converting {item:ID}/{tag:Name} tokens
     * and whichever glossary phrases the site's *current* descriptionMode/enabled settings would actually apply
     * into real [img] BBCode — matches what the site currently shows, not "every glossary entry unconditionally."
     */
    async exportEditedTranslations(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.translationsUrl) {
            throw new Error("Не задан источник переводов на странице «Источники»");
        }

        const glossaryToApply =
            this.descriptionSettings.descriptionMode === "icons-emoji"
                ? this.glossary
                : this.descriptionSettings.descriptionMode === "text-icons"
                  ? getEnabledGlossaryEntries(this.glossary)
                  : [];

        const names: Record<string, string> = {};
        const descriptions: Record<string, string> = {};
        // Raw (pre-BBCode-conversion) values, keyed the same as translationOverrides — snapshotted below only
        // once the send actually succeeds, so pendingExportCount can tell "sent" apart from "still pending".
        const sentOverrides: Record<string, string> = {};

        for (const item of this.allItems) {
            const nameKey = item.nameKey ?? item.id;
            const descKey = item.descKey ?? `${item.id}_desc`;

            const nameOverride = this.translationOverrides[nameKey];
            if (nameOverride) {
                names[nameKey] = nameOverride;
                sentOverrides[nameKey] = nameOverride;
            }

            const descOverride = this.translationOverrides[descKey];
            if (descOverride) {
                descriptions[descKey] = buildExportDescriptionText(descOverride, {
                    items: this.allItems,
                    itemIcons: this.itemIcons,
                    tagIcons: this.tagIcons,
                    allGlossaryEntries: this.glossary,
                    glossaryToApply,
                    spriteWidthPx: this.descriptionSettings.spriteWidthPx,
                });
                sentOverrides[descKey] = descOverride;
            }
        }

        // Rounds only ever have an editable description (see RoundDetailPage) — no name half, unlike items.
        for (const round of this.rounds) {
            const descOverride = this.translationOverrides[round.descKey];
            if (descOverride) {
                descriptions[round.descKey] = buildExportDescriptionText(descOverride, {
                    items: this.allItems,
                    itemIcons: this.itemIcons,
                    tagIcons: this.tagIcons,
                    allGlossaryEntries: this.glossary,
                    glossaryToApply,
                    spriteWidthPx: this.descriptionSettings.spriteWidthPx,
                });
                sentOverrides[round.descKey] = descOverride;
            }
        }

        // Packs have both an editable name and description (see PackDetailPage), same shape as items.
        for (const pack of this.packs) {
            const nameOverride = this.translationOverrides[pack.nameKey];
            if (nameOverride) {
                names[pack.nameKey] = nameOverride;
                sentOverrides[pack.nameKey] = nameOverride;
            }

            const descOverride = this.translationOverrides[pack.descKey];
            if (descOverride) {
                descriptions[pack.descKey] = buildExportDescriptionText(descOverride, {
                    items: this.allItems,
                    itemIcons: this.itemIcons,
                    tagIcons: this.tagIcons,
                    allGlossaryEntries: this.glossary,
                    glossaryToApply,
                    spriteWidthPx: this.descriptionSettings.spriteWidthPx,
                });
                sentOverrides[pack.descKey] = descOverride;
            }
        }

        // Balls have both an editable name and description (see BallDetailPage), same shape as items/packs.
        for (const ball of this.balls) {
            const nameOverride = this.translationOverrides[ball.nameKey];
            if (nameOverride) {
                names[ball.nameKey] = nameOverride;
                sentOverrides[ball.nameKey] = nameOverride;
            }

            const descOverride = this.translationOverrides[ball.descKey];
            if (descOverride) {
                descriptions[ball.descKey] = buildExportDescriptionText(descOverride, {
                    items: this.allItems,
                    itemIcons: this.itemIcons,
                    tagIcons: this.tagIcons,
                    allGlossaryEntries: this.glossary,
                    glossaryToApply,
                    spriteWidthPx: this.descriptionSettings.spriteWidthPx,
                });
                sentOverrides[ball.descKey] = descOverride;
            }
        }

        const result = await postExportPayload(this.sources.translationsUrl, { token, names, descriptions });

        if (result.ok) {
            this.exportedOverrides = { ...this.exportedOverrides, ...sentOverrides };
            this.notify();
            void replaceExportedOverridesRemote(this.exportedOverrides).catch((error) =>
                console.error("exportEditedTranslations → Firestore", error)
            );
        }

        return result;
    }

    /**
     * Sends every item's and pack's current name/description, and every round's current description — not just
     * ones with a site-authored override. Exists because
     * glossary phrase matches and {tag:Name}/{item:ID} tokens can newly apply to an item's description (e.g. a
     * glossary entry just got a new phrase, or a tag just got an icon) without the description text itself ever
     * being edited on the site — exportEditedTranslations() has no way to notice that, since translationOverrides
     * never changed. This instead renders each item exactly as the site currently shows it (override if one
     * exists, else the imported translation) through the same buildExportDescriptionText conversion, so a
     * glossary/tag-icon change can be pushed to every affected item at once instead of re-editing each one just
     * to re-trigger an override.
     */
    async exportAllTranslations(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.translationsUrl) {
            throw new Error("Не задан источник переводов на странице «Источники»");
        }

        const glossaryToApply =
            this.descriptionSettings.descriptionMode === "icons-emoji"
                ? this.glossary
                : this.descriptionSettings.descriptionMode === "text-icons"
                  ? getEnabledGlossaryEntries(this.glossary)
                  : [];

        const names: Record<string, string> = {};
        const descriptions: Record<string, string> = {};

        for (const item of this.allItems) {
            const nameKey = item.nameKey ?? item.id;
            const descKey = item.descKey ?? `${item.id}_desc`;

            // Real translated text only — not itemName()/itemDescription()'s own key/id/"" fallback, which would
            // otherwise overwrite a real Sheet cell with a literal placeholder for an item that never had a
            // translation loaded at all.
            const name = this.getTranslation(item.nameKey);
            if (name) names[nameKey] = name;

            const description = this.getTranslation(item.descKey);
            if (description) {
                descriptions[descKey] = buildExportDescriptionText(description, {
                    items: this.allItems,
                    itemIcons: this.itemIcons,
                    tagIcons: this.tagIcons,
                    allGlossaryEntries: this.glossary,
                    glossaryToApply,
                    spriteWidthPx: this.descriptionSettings.spriteWidthPx,
                });
            }
        }

        // Rounds only ever have an editable description (see RoundDetailPage) — no name half, unlike items.
        for (const round of this.rounds) {
            const description = this.getTranslation(round.descKey);
            if (description) {
                descriptions[round.descKey] = buildExportDescriptionText(description, {
                    items: this.allItems,
                    itemIcons: this.itemIcons,
                    tagIcons: this.tagIcons,
                    allGlossaryEntries: this.glossary,
                    glossaryToApply,
                    spriteWidthPx: this.descriptionSettings.spriteWidthPx,
                });
            }
        }

        // Packs have both an editable name and description (see PackDetailPage), same shape as items.
        for (const pack of this.packs) {
            const name = this.getTranslation(pack.nameKey);
            if (name) names[pack.nameKey] = name;

            const description = this.getTranslation(pack.descKey);
            if (description) {
                descriptions[pack.descKey] = buildExportDescriptionText(description, {
                    items: this.allItems,
                    itemIcons: this.itemIcons,
                    tagIcons: this.tagIcons,
                    allGlossaryEntries: this.glossary,
                    glossaryToApply,
                    spriteWidthPx: this.descriptionSettings.spriteWidthPx,
                });
            }
        }

        // Balls have both an editable name and description (see BallDetailPage), same shape as items/packs.
        for (const ball of this.balls) {
            const name = this.getTranslation(ball.nameKey);
            if (name) names[ball.nameKey] = name;

            const description = this.getTranslation(ball.descKey);
            if (description) {
                descriptions[ball.descKey] = buildExportDescriptionText(description, {
                    items: this.allItems,
                    itemIcons: this.itemIcons,
                    tagIcons: this.tagIcons,
                    allGlossaryEntries: this.glossary,
                    glossaryToApply,
                    spriteWidthPx: this.descriptionSettings.spriteWidthPx,
                });
            }
        }

        const result = await postExportPayload(this.sources.translationsUrl, { token, names, descriptions });

        if (result.ok) {
            // Every current override just went out too (as part of "every item"), so it's no longer pending.
            this.exportedOverrides = { ...this.exportedOverrides, ...this.translationOverrides };
            this.notify();
            void replaceExportedOverridesRemote(this.exportedOverrides).catch((error) =>
                console.error("exportAllTranslations → Firestore", error)
            );
        }

        return result;
    }

    /** How many content edits haven't been sent yet — see exportContentChanges(). */
    get contentPendingExportCount(): number {
        return (
            this.dirtyItemIds.size +
            this.newMechanicRowIds.size +
            this.editedMechanicRowIds.size +
            this.deletedMechanicRows.length +
            this.dirtyUpgradeChainIds.size +
            this.dirtyReplaceSourceIds.size
        );
    }

    /**
     * Sends content edits to the same Apps Script `doPost` endpoint the translation export uses (see
     * docs/apps-script-export.gs), in three shapes:
     *  - `items` — upserted by ItemId, a real unique key.
     *  - `newMechanicRows` — rows authored here, appended.
     *  - `updatedMechanicRows` — edits to already-existing rows, applied in place. A mechanic row has no unique
     *    key of its own, so each one is addressed by `{itemId, ordinal}` (its position among *that item's* rows
     *    in that table) rather than by absolute row number: unrelated rows being added or removed elsewhere in
     *    the sheet can't shift it. As a second guard, `originalFields` carries the values as imported, and the
     *    Apps Script side refuses the write (reporting a conflict) if the target row no longer matches them —
     *    so a row that someone else reordered or edited in the meantime is never silently clobbered.
     * Posts to `sources.configUrl` (items/mechanics live in the config sheet), not `translationsUrl` — if those
     * are two different spreadsheets, the doPost extension needs to live in the config one specifically.
     */
    async exportContentChanges(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.configUrl) {
            throw new Error("Не задан источник конфигурации на странице «Источники»");
        }

        const itemTableByType: Record<string, "Cards" | "Houses" | "Artefacts"> = {
            Card: "Cards",
            House: "Houses",
            Artefact: "Artefacts",
        };

        const items: NonNullable<Parameters<typeof postExportPayload>[1]["items"]> = { Cards: {}, Houses: {}, Artefacts: {} };
        for (const itemId of this.dirtyItemIds) {
            const item = this.getItem(itemId);
            if (!item) continue;
            const table = itemTableByType[item.itemType ?? "Card"] ?? "Cards";
            const original = this.originalItemRaw.get(itemId);
            if (!original) {
                // No sheet row yet (created here) — the whole row has to be written.
                items[table][itemId] = item.raw;
                continue;
            }
            // Only what changed. A column dropped from raw entirely counts as cleared, so it's sent as "".
            const changed: Record<string, string> = { ItemId: itemId };
            for (const column of new Set([...Object.keys(original), ...Object.keys(item.raw)])) {
                if ((original[column] ?? "") !== (item.raw[column] ?? "")) changed[column] = item.raw[column] ?? "";
            }
            items[table][itemId] = changed;
        }

        const newMechanicRows: Record<string, Record<string, string>[]> = {};
        for (const rowId of this.newMechanicRowIds) {
            const row = this.mechanics.find((r) => r.id === rowId);
            if (!row) continue;
            (newMechanicRows[row.table] ??= []).push({ ItemId: row.itemId, ...row.fields });
        }

        const updatedMechanicRows: Record<string, MechanicRowUpdate[]> = {};
        for (const rowId of this.editedMechanicRowIds) {
            const row = this.mechanics.find((r) => r.id === rowId);
            if (!row) continue;

            // Position among this item's rows in this table, in import order — which is sheet order. Rows
            // appended locally sort after every imported one, so they can't shift an imported row's ordinal.
            const ordinal = this.mechanics
                .filter((r) => r.table === row.table && r.itemId === row.itemId)
                .findIndex((r) => r.id === rowId);
            if (ordinal < 0) continue;

            // Send every column the table defines, not just the populated ones, so clearing a field on the
            // canvas actually blanks it in the sheet instead of leaving the old value behind.
            const knownColumns = MECHANIC_TABLE_COLUMNS[row.table as keyof typeof MECHANIC_TABLE_COLUMNS];
            const columns = (knownColumns ?? Object.keys(row.fields)).filter((column) => column !== "ItemId");
            const original = this.originalMechanicFields.get(rowId) ?? row.fields;

            const fields: Record<string, string> = {};
            const originalFields: Record<string, string> = {};
            for (const column of columns) {
                fields[column] = row.fields[column] ?? "";
                originalFields[column] = original[column] ?? "";
            }

            (updatedMechanicRows[row.table] ??= []).push({ itemId: row.itemId, ordinal, fields, originalFields });
        }

        // Grouped per table so the receiver can delete highest-ordinal-first and not shift the ones behind it.
        const deletedMechanicRows: Record<string, { itemId: string; ordinal: number; originalFields: Record<string, string> }[]> = {};
        for (const deleted of this.deletedMechanicRows) {
            (deletedMechanicRows[deleted.table] ??= []).push({
                itemId: deleted.itemId,
                ordinal: deleted.ordinal,
                originalFields: deleted.originalFields,
            });
        }

        // One CardUpgrades row per chain, upserted by UpgradeChainId. Every UpgradeId column the sheet defines is
        // sent, blanks included, so a chain that lost a tier actually clears that cell instead of keeping a stale id.
        const upgradeChains: Record<string, Record<string, string>> = {};
        for (const chainId of this.dirtyUpgradeChainIds) {
            const chain = this.upgradeChains.find((entry) => entry.id === chainId);
            if (!chain) continue;
            const columns: Record<string, string> = {};
            const width = Math.max(chain.itemIds.length, UPGRADE_ID_COLUMN_COUNT);
            for (let i = 0; i < width; i++) columns[`UpgradeId${i + 1}`] = chain.itemIds[i] ?? "";
            upgradeChains[chainId] = columns;
        }

        // Replace rules have no per-row key, so a source item's rows are replaced as a group — which is also the
        // only way a deleted rule disappears. An item with no rules left sends an empty array, i.e. "remove them".
        const replaceRules: Record<string, Record<string, Record<string, string>[]>> = {};
        for (const sourceId of this.dirtyReplaceSourceIds) {
            for (const table of ["ReplaceItem", "ReplaceOnTrigger"] as const) {
                const rows = this.replaceRules
                    .filter((rule) => rule.itemIdToReplace === sourceId && rule.source === table)
                    .map((rule) => ({
                        ItemIdToReplace: rule.itemIdToReplace,
                        ReplacementItem: rule.replacementItem,
                        ...rule.fields,
                    }));
                (replaceRules[table] ??= {})[sourceId] = rows;
            }
        }

        const result = await postExportPayload(this.sources.configUrl, {
            token,
            names: {},
            descriptions: {},
            items,
            newMechanicRows,
            updatedMechanicRows,
            deletedMechanicRows,
            upgradeChains,
            replaceRules,
        });

        if (result.ok) {
            // The sheet now has rows under these ids, so renaming them here would orphan those rows.
            for (const itemId of this.dirtyItemIds) this.locallyCreatedItemIds.delete(itemId);
            this.dirtyItemIds = new Set();
            this.newMechanicRowIds = new Set();
            this.editedMechanicRowIds = new Set();
            this.deletedMechanicRows = [];
            this.dirtyUpgradeChainIds = new Set();
            this.dirtyReplaceSourceIds = new Set();
            // Re-baseline: what's now in the sheet is what we just sent, so a follow-up edit of the same row
            // verifies against the values it will actually find there.
            this.originalMechanicFields = new Map();
            this.originalItemRaw = new Map();
            this.notify();
        }

        return result;
    }

    /** How many Decks-page edits haven't been sent yet — see exportDeckChanges(). Includes Ball decks
     *  ("Колоды шаров" tab, folded into the same export flow/button/count). Independent of
     *  contentPendingExportCount, a separate export flow with its own button. */
    get blueprintDeckPendingExportCount(): number {
        return (
            this.blueprintDirtyDeckIds.size +
            this.blueprintDeletedDecks.size +
            this.blueprintDirtyBallGroupIds.size +
            this.blueprintDeletedBallGroupIds.size
        );
    }

    /**
     * Writes the «Магазины» edits back to ShopSettings.
     *
     * A shop is a *variable-size group of rows* sharing one ShopId, so it exports the same way decks and packs
     * do — every row for that ShopId is deleted and the current set written fresh (replaceRowsByGroupId), which
     * is also how a removed pack disappears; there's no per-row key to patch in place.
     *
     * The subtlety is that the sheet's two id columns are independent lists that merely share rows: a shop with
     * three house packs and nine card packs is nine rows, and only the first three carry a HousesInShop value.
     * So the row count is the longer of the two lists, and each column is filled from its own list by index.
     */
    async exportShopChanges(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.configUrl) {
            throw new Error("Не задан источник конфигурации на странице «Источники»");
        }

        const shops: NonNullable<Parameters<typeof postExportPayload>[1]["shops"]> = {};

        for (const shopId of this.dirtyShopIds) {
            const shop = this.getShop(shopId);
            if (!shop) continue;

            // A slot added but not yet filled in has no packId — drop it rather than writing a blank cell.
            const housePacks = shop.housePacks.filter((entry) => entry.packId);
            const cardPacks = shop.cardPacks.filter((entry) => entry.packId);

            const rowCount = Math.max(housePacks.length, cardPacks.length);
            shops[shop.id] = Array.from({ length: rowCount }, (_unused, index) => ({
                HousesInShop: housePacks[index]?.packId ?? "",
                PacksInShop: cardPacks[index]?.packId ?? "",
                PacksWeights: cardPacks[index]?.weight?.toString() ?? "",
            }));
        }

        for (const shopId of this.deletedShopIds) {
            shops[shopId] = [];
        }

        const result = await postExportPayload(this.sources.configUrl, { token, names: {}, descriptions: {}, shops });

        // An Apps Script deployment that predates the `shops` branch ignores the key and still answers ok — the
        // rows silently never arrive, and clearing the dirty set here would lose them. A run that really wrote
        // always reports the sheet it touched, so a missing key means the deployment is stale, not that the
        // export succeeded.
        if (result.ok && Object.keys(shops).length > 0 && result.updated?.ShopSettings === undefined) {
            return {
                ok: false,
                error:
                    "Скрипт таблицы не знает про магазины — в ответе нет ShopSettings. " +
                    "Обновите Apps Script из docs/apps-script-export.gs и переразверните его (Deploy → Manage deployments → New version).",
            };
        }

        if (result.ok) {
            this.dirtyShopIds = new Set();
            this.deletedShopIds = new Set();
            this.notify();
        }

        return result;
    }

    /**
     * Sends Decks-page edits (Decks/DecksShop/Ball decks) to the same Apps Script `doPost` endpoint. Posts to
     * `sources.configUrl`, same reasoning as exportContentChanges — decks live in the config sheet, not
     * translations.
     *
     * Decks/DecksShop: unlike items (upserted by a real unique ItemId) or mechanic rows (append-only, since a row
     * has no stable key), a deck's *whole row set* for its DeckId is replaced on every export (see
     * docs/apps-script-export.gs's `replaceRowsByGroupId`) — this sidesteps the "which spreadsheet row is this
     * edit for" problem entirely, since a deck is naturally edited as a cohesive unit (add/remove/reorder entries)
     * rather than one fixed row getting column patches. A deleted deck (blueprintDeletedDecks) sends an empty row
     * array for its DeckId, which the sheet-side helper treats as "clear existing rows, add nothing back" — i.e.
     * deletion, with no separate signal needed.
     *
     * Ball decks (BallGroups): the real sheet's 7 `Ball` columns are all literally named `Ball` (Papa's
     * `Ball_1`../`Ball_6` renaming is a client-side parsing artifact only), so neither `replaceRowsByGroupId` nor
     * `upsertFullRows` fit — uses the new `replaceWideGroupRow` helper instead (single row per group, writes
     * across every same-named column). An empty `ballIds` array for a group id deletes that row entirely.
     */
    async exportDeckChanges(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.configUrl) {
            throw new Error("Не задан источник конфигурации на странице «Источники»");
        }

        const decks: NonNullable<Parameters<typeof postExportPayload>[1]["decks"]> = {};

        const entryToRow = (entry: Deck["entries"][number]): Record<string, string> => ({
            Item: entry.itemId,
            Weight: entry.weight?.toString() ?? "",
            Cost: entry.cost?.toString() ?? "",
        });

        for (const deckId of this.blueprintDirtyDeckIds) {
            const deck = this.getDeck(deckId);
            if (!deck) continue;
            // A row-in-progress (added via "+ Добавить предмет" but no item picked yet) has no itemId — skip it
            // rather than exporting a blank Item column.
            (decks[deck.source] ??= {})[deck.id] = deck.entries.filter((entry) => entry.itemId).map(entryToRow);
        }

        for (const [deckId, source] of this.blueprintDeletedDecks) {
            (decks[source] ??= {})[deckId] = [];
        }

        const ballGroups: Record<string, string[]> = {};

        for (const groupId of this.blueprintDirtyBallGroupIds) {
            const group = this.getBallGroup(groupId);
            if (!group) continue;
            ballGroups[group.id] = group.ballIds;
        }

        for (const groupId of this.blueprintDeletedBallGroupIds) {
            ballGroups[groupId] = [];
        }

        const result = await postExportPayload(this.sources.configUrl, {
            token,
            names: {},
            descriptions: {},
            decks,
            ballGroups,
        });

        if (result.ok) {
            this.blueprintDirtyDeckIds = new Set();
            this.blueprintDeletedDecks = new Map();
            this.blueprintDirtyBallGroupIds = new Set();
            this.blueprintDeletedBallGroupIds = new Set();
            this.notify();
        }

        return result;
    }

    /** How many Packs-page config edits haven't been sent yet — see exportPackChanges(). Independent of the
     *  Decks/content-editing counters and of the ordinary translations pendingExportCount (name/description edits
     *  for a pack flow through that existing translations path, not this one — see exportPackChanges's doc). */
    get blueprintPackPendingExportCount(): number {
        return this.blueprintDirtyPackIds.size + this.blueprintDeletedPackIds.size;
    }

    /**
     * Sends Packs-page **config** edits (Cost/ItemsToTake/UseWeights/AllowDuplicates/sources) to the same Apps
     * Script `doPost` endpoint, reusing the exact `decks` mechanism (`replaceRowsByGroupId`, see
     * docs/apps-script-export.gs) — a pack is grouped-by-id the same way a deck is (one row per source-deck
     * entry, no stable per-row key), so no new server-side helper was needed, just a `packs` payload field.
     * Deliberately does NOT touch a pack's name/description — those are ordinary translationOverrides
     * (pack.nameKey/descKey) and already flow through exportEditedTranslations/exportAllTranslations, same as
     * items; this method only ever sends the `Packs` sheet's own config columns to `sources.configUrl`.
     *
     * `MetaTag` is deliberately never included in the exported row (confirmed with the user it's read-only/unused
     * for now) — since replaceRowsByGroupId fully replaces a pack's rows rather than patching, if a pack's
     * MetaTag is ever populated on the real sheet later, exporting that pack from here would blank it. Not a
     * concern today (every real MetaTag cell is empty), but worth remembering if that changes.
     */
    async exportPackChanges(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.configUrl) {
            throw new Error("Не задан источник конфигурации на странице «Источники»");
        }

        const packs: NonNullable<Parameters<typeof postExportPayload>[1]["packs"]> = {};

        const entryToRow = (pack: Pack, entry: PackSourceEntry): Record<string, string> => ({
            Cost: pack.cost?.toString() ?? "",
            ItemsToTake: pack.itemsToTake?.toString() ?? "",
            SourceDeckId: entry.sourceDeckId,
            UseWeights: pack.useWeights ? "1" : "",
            AllowDuplicates: pack.allowDuplicates ? "1" : "",
            ItemNumber: entry.itemNumber?.toString() ?? "",
            ItemCount: entry.itemCount?.toString() ?? "",
            ItemWeight: entry.itemWeight?.toString() ?? "",
            ItemCost: entry.itemCost?.toString() ?? "",
        });

        for (const packId of this.blueprintDirtyPackIds) {
            const pack = this.getPack(packId);
            if (!pack) continue;
            // A source-in-progress (added via "+ Добавить источник" but no deck picked yet) has no sourceDeckId
            // — skip it rather than exporting a blank SourceDeckId column.
            packs[pack.id] = pack.sources
                .filter((entry) => entry.sourceDeckId)
                .map((entry) => entryToRow(pack, entry));
        }

        for (const packId of this.blueprintDeletedPackIds) {
            packs[packId] = [];
        }

        const result = await postExportPayload(this.sources.configUrl, { token, names: {}, descriptions: {}, packs });

        if (result.ok) {
            this.blueprintDirtyPackIds = new Set();
            this.blueprintDeletedPackIds = new Set();
            this.notify();
        }

        return result;
    }

    /** How many Balls-page config edits haven't been sent yet — see exportBallChanges(). Independent of the
     *  ordinary translations pendingExportCount (a ball's name/description flows through that existing path). */
    get blueprintBallPendingExportCount(): number {
        return this.blueprintDirtyBallIds.size;
    }

    /**
     * Sends Balls-page **config** edits (RunMin/RunMax/InertiaMin/InertiaMax/ValueMin/ValueMax/Color) to the same
     * Apps Script `doPost` endpoint, reusing the *existing* `upsertFullRows` mechanism the item
     * export already uses — Balls is a flat row-per-object table (unlike Decks/Packs, no grouping), so it fits
     * the same `items`-style {id -> full column bag} shape exactly, no new server-side helper needed. Deliberately
     * does NOT touch a ball's name/description (existing translationOverrides path, same split as Packs).
     *
     * Note: like the item export, this has no delete signal — `upsertFullRows` only ever upserts, so
     * a locally `deleteBall`'d ball simply stops being sent, it is never removed from the real sheet by exporting.
     */
    async exportBallChanges(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.configUrl) {
            throw new Error("Не задан источник конфигурации на странице «Источники»");
        }

        const balls: NonNullable<Parameters<typeof postExportPayload>[1]["balls"]> = {};

        for (const ballId of this.blueprintDirtyBallIds) {
            const ball = this.getBall(ballId);
            if (!ball) continue;
            balls[ball.id] = {
                RunMin: ball.runMin?.toString() ?? "",
                RunMax: ball.runMax?.toString() ?? "",
                InertiaMin: ball.inertiaMin?.toString() ?? "",
                InertiaMax: ball.inertiaMax?.toString() ?? "",
                ValueMin: ball.valueMin?.toString() ?? "",
                ValueMax: ball.valueMax?.toString() ?? "",
                Color: ball.color ?? "",
            };
        }

        const result = await postExportPayload(this.sources.configUrl, { token, names: {}, descriptions: {}, balls });

        if (result.ok) {
            this.blueprintDirtyBallIds = new Set();
            this.notify();
        }

        return result;
    }

    /** How many Rounds-page edits haven't been sent yet — see exportRoundChanges(). No delete/create counterpart
     *  (see updateRoundFields's doc), so this is just the dirty set's size, unlike Decks/Packs/Balls above. */
    get blueprintRoundPendingExportCount(): number {
        return this.blueprintDirtyRoundIds.size;
    }

    /**
     * Sends Rounds-page edits (rules/invisibleArtefactId/tempDeckId/deckBalls, see RoundDetailPage) to the same
     * Apps Script `doPost` endpoint. Unlike Decks/Packs/Balls, this is the FIRST config-export path RoundSettings
     * has ever had — the sheet mixes both row shapes at once: `RoundRules`/`AdditionalInvisibleArtefact`/`TempDeck`
     * are ordinary one-column-per-field cells (fits `upsertFullRows`, matched by `RoundId`, same as Balls/Blueprint
     * Lab items), while `DeckBalls` is the sheet's own repeated-column field (same shape as BallGroups' `Ball`
     * columns — see docs/apps-script-export.gs's `replaceWideGroupRow`), so it's sent as a second payload field and
     * written with the same helper built for ball decks. Round name/description are unaffected — rounds still have
     * no editable name, and description flows through the existing translationOverrides path.
     */
    async exportRoundChanges(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.configUrl) {
            throw new Error("Не задан источник конфигурации на странице «Источники»");
        }

        const fields: Record<string, Record<string, string>> = {};
        const deckBalls: Record<string, string[]> = {};

        for (const roundId of this.blueprintDirtyRoundIds) {
            const round = this.getRound(roundId);
            if (!round) continue;
            fields[round.id] = {
                RoundRules: round.rules ?? "",
                AdditionalInvisibleArtefact: round.invisibleArtefactId ?? "",
                TempDeck: round.tempDeckId ?? "",
            };
            deckBalls[round.id] = round.deckBalls;
        }

        const result = await postExportPayload(this.sources.configUrl, {
            token,
            names: {},
            descriptions: {},
            rounds: { fields, deckBalls },
        });

        if (result.ok) {
            this.blueprintDirtyRoundIds = new Set();
            this.notify();
        }

        return result;
    }

    /** How many Sprints-page edits haven't been sent yet — see exportSprintChanges(). */
    get blueprintSprintPendingExportCount(): number {
        return this.blueprintDirtySprintIds.size + this.blueprintDeletedSprintIds.size;
    }

    /**
     * Sends Sprints-page edits to the same Apps Script `doPost` endpoint, reusing the `decks`/`packs` replace-by-
     * group-id shape — but Sprints uniquely needs BOTH that shape AND the repeated-column-spreading shape
     * `ballGroups`/`rounds.deckBalls` use, on the SAME row: each row has ordinary one-column fields (Quota/Stage/
     * RewardTickerts/RewardTicketsPerBall/RewardPack/Shops/PackDeckStart) plus the sheet's own repeated
     * `RoundSettings` columns (the round-id pool). Neither `replaceRowsByGroupId` nor `replaceWideGroupRow` alone
     * fits, so this uses the new `replaceRowsByGroupIdWithRepeatedColumn` helper (docs/apps-script-export.gs),
     * which combines both.
     *
     * `RoundNumber` is never stored on `SprintRound` (see Sprint.ts's doc) — it's computed here, fresh, from each
     * round's position in the array, since array order IS the order the user arranged via the stage board.
     */
    async exportSprintChanges(): Promise<ExportResult> {
        const token = import.meta.env.VITE_SHEETS_EXPORT_TOKEN;
        if (!token) {
            throw new Error("VITE_SHEETS_EXPORT_TOKEN не задан в .env.local — см. .env.example");
        }
        if (!this.sources.configUrl) {
            throw new Error("Не задан источник конфигурации на странице «Источники»");
        }

        const sprints: NonNullable<Parameters<typeof postExportPayload>[1]["sprints"]> = {};

        for (const sprintId of this.blueprintDirtySprintIds) {
            const sprint = this.getSprint(sprintId);
            if (!sprint) continue;
            sprints[sprint.id] = sprint.rounds.map((round, index) => ({
                columns: {
                    RoundNumber: String(index + 1),
                    Quota: round.quota?.toString() ?? "",
                    Stage: round.stage?.toString() ?? "",
                    RewardTickerts: round.rewardTickets?.toString() ?? "",
                    RewardTicketsPerBall: round.rewardTicketsPerBall?.toString() ?? "",
                    RewardPack: round.rewardPackId ?? "",
                    Shops: round.shopId ?? "",
                    // Written back as-is: the engine still reads it (see SprintRound.housesInShopPackId).
                    HousesInShop: round.housesInShopPackId ?? "",
                    PackDeckStart: round.packDeckStartId ?? "",
                },
                repeatedValues: round.roundIds,
            }));
        }

        for (const sprintId of this.blueprintDeletedSprintIds) {
            sprints[sprintId] = [];
        }

        const result = await postExportPayload(this.sources.configUrl, { token, names: {}, descriptions: {}, sprints });

        if (result.ok) {
            this.blueprintDirtySprintIds = new Set();
            this.blueprintDeletedSprintIds = new Set();
            this.notify();
        }

        return result;
    }

    itemName(item: Item): string {
        return this.getTranslation(item.nameKey) ?? item.nameKey ?? item.id;
    }

    itemDescription(item: Item): string {
        return this.getTranslation(item.descKey) ?? "";
    }

    roundName(round: Round): string {
        return this.getTranslation(round.id) ?? round.rules ?? round.id;
    }

    roundDescription(round: Round): string {
        return this.getTranslation(round.descKey) ?? "";
    }

    packName(pack: Pack): string {
        return this.getTranslation(pack.nameKey) ?? pack.id;
    }

    packDescription(pack: Pack): string {
        return this.getTranslation(pack.descKey) ?? "";
    }

    ballName(ball: Ball): string {
        return this.getTranslation(ball.nameKey) ?? ball.id;
    }

    ballDescription(ball: Ball): string {
        return this.getTranslation(ball.descKey) ?? "";
    }

    /**
     * Pushes this item's mechanic rows onto every later tier of its upgrade chain (base → + → ++), the mechanics
     * counterpart to copyDescriptionToUpgrades. Deliberately touches *only* mechanics: an item's own columns
     * (ValueMin/ValueMax/Cost/Weight/tags/...) are exactly what's meant to differ between tiers, so copying them
     * would flatten the upgrade.
     *
     * The same caution applies inside the mechanic rows themselves. In the real config most tier rows are
     * byte-identical to their base, but a handful scale on purpose — Активация соседнего дома goes
     * ActivationCount 1→2→3, Случайная активация goes TargetCount 3→6→9. Blindly overwriting those would quietly
     * undo the upgrade, so where a tier already has its own value in one of those counter columns it's kept and
     * only the surrounding structure is copied. A tier row that doesn't exist yet is created outright, taking the
     * source's values as-is (there's no tier-specific number to preserve in that case).
     *
     * Rows a tier has but the source doesn't are left alone rather than deleted — the Sheets export can update
     * and append but not remove, so "deleting" here would only ever desync the site from the table.
     */
    copyMechanicsToUpgrades(itemId: string): { tiers: number; updated: number; added: number } {
        const result = { tiers: 0, updated: 0, added: 0 };

        const chain = this.chainForItem(itemId);
        if (!chain) return result;
        const index = chain.itemIds.indexOf(itemId);
        if (index === -1) return result;

        const sourceRows = this.mechanics.filter((row) => row.itemId === itemId);
        if (sourceRows.length === 0) return result;

        const sourceTables = [...new Set(sourceRows.map((row) => row.table))];

        for (const tierId of chain.itemIds.slice(index + 1)) {
            if (!this.getItem(tierId)) continue;
            result.tiers++;

            for (const table of sourceTables) {
                const fromRows = sourceRows.filter((row) => row.table === table);
                const tierRows = this.mechanics.filter((row) => row.itemId === tierId && row.table === table);
                const columns = (
                    MECHANIC_TABLE_COLUMNS[table as keyof typeof MECHANIC_TABLE_COLUMNS] ??
                    [...new Set(fromRows.flatMap((row) => Object.keys(row.fields)))]
                ).filter((column) => column !== "ItemId");

                fromRows.forEach((from, ordinal) => {
                    const tierRow = tierRows[ordinal];

                    // Every column is written explicitly, blanks included — a merge would leave a filter the
                    // source has since cleared still set on the tier.
                    const fields: Record<string, string> = {};
                    for (const column of columns) fields[column] = from.fields[column] ?? "";

                    if (!tierRow) {
                        // Deterministic id: clicking twice re-writes the same row instead of appending a duplicate.
                        this.upsertMechanicRow({
                            id: `content:copy:${tierId}:${table}:${ordinal}`,
                            table,
                            itemId: tierId,
                            fields,
                        });
                        result.added++;
                        return;
                    }

                    for (const column of PER_TIER_MECHANIC_COLUMNS) {
                        if (tierRow.fields[column]) fields[column] = tierRow.fields[column];
                    }

                    const changed = columns.some((column) => (tierRow.fields[column] ?? "") !== fields[column]);
                    if (!changed) return;

                    this.updateMechanicRowFields(tierRow.id, fields);
                    result.updated++;
                });
            }
        }

        return result;
    }

    /** Tier chains almost always share the exact same description template across + and ++ (only the underlying
     *  values differ, resolved per-item via {ValueOrRange}-style tokens) — this pushes the given item's current
     *  description text onto every later tier in its upgrade chain, so an edit doesn't have to be retyped by hand
     *  into each one. Only propagates forward (base → + → ++), matching what the chain's own order implies. */
    copyDescriptionToUpgrades(itemId: string): void {
        const chain = this.chainForItem(itemId);
        if (!chain) return;
        const index = chain.itemIds.indexOf(itemId);
        if (index === -1) return;

        const sourceItem = this.getItem(itemId);
        if (!sourceItem) return;
        const text = this.itemDescription(sourceItem);

        for (const tierId of chain.itemIds.slice(index + 1)) {
            const tierItem = this.getItem(tierId);
            if (!tierItem) continue;
            this.setTranslationOverride(tierItem.descKey ?? `${tierItem.id}_desc`, text);
        }
    }

    /** Same idea as copyDescriptionToUpgrades, but for the item's name — each tier forward gets one more trailing
     *  "+" than the last (matching the game's own "Вор" / "Вор+" / "Вор++" naming convention), rather than the
     *  exact same text repeated verbatim. */
    copyNameToUpgrades(itemId: string): void {
        const chain = this.chainForItem(itemId);
        if (!chain) return;
        const index = chain.itemIds.indexOf(itemId);
        if (index === -1) return;

        const sourceItem = this.getItem(itemId);
        if (!sourceItem) return;
        const baseName = this.itemName(sourceItem);

        chain.itemIds.slice(index + 1).forEach((tierId, offset) => {
            const tierItem = this.getItem(tierId);
            if (!tierItem) return;
            this.setTranslationOverride(tierItem.nameKey ?? tierItem.id, baseName + "+".repeat(offset + 1));
        });
    }

    /**
     * Copies this item's own columns onto every later tier — **everything, balance numbers included**, which is
     * the explicitly chosen behaviour: ValueMin/ValueMax/MoneyValue/Cost/Weight on the tiers get overwritten.
     * That's normally exactly the data meant to differ per tier, so the caller must confirm first and say so.
     * Tags travel with the raw bag (upsertItem keeps raw.Tags in sync), and ItemId is never copied.
     */
    copyParamsToUpgrades(itemId: string): { tiers: number } {
        const tiers = this.laterTiersOf(itemId);
        const source = this.getItem(itemId);
        if (!source) return { tiers: 0 };

        const raw = { ...source.raw };
        delete raw.ItemId;

        for (const tier of tiers) this.upsertItem(tier.id, tier.itemType ?? source.itemType ?? "Card", { raw });
        return { tiers: tiers.length };
    }

    /** Copies this item's tags onto every later tier, leaving their other columns alone. */
    copyTagsToUpgrades(itemId: string): { tiers: number } {
        const tiers = this.laterTiersOf(itemId);
        const source = this.getItem(itemId);
        if (!source) return { tiers: 0 };

        for (const tier of tiers) this.upsertItem(tier.id, tier.itemType ?? "Card", { tags: [...source.tags] });
        return { tiers: tiers.length };
    }

    /** The items after `itemId` in its upgrade chain, skipping chain entries that aren't real items. */
    private laterTiersOf(itemId: string): Item[] {
        const chain = this.chainForItem(itemId);
        if (!chain) return [];
        const index = chain.itemIds.indexOf(itemId);
        if (index === -1) return [];
        return chain.itemIds
            .slice(index + 1)
            .map((tierId) => this.getItem(tierId))
            .filter((tier): tier is Item => Boolean(tier));
    }

    /** Replaces a chain's tier list wholesale (add/remove/reorder all go through here) and marks it for export. */
    setUpgradeChain(chainId: string, itemIds: string[]): void {
        const existing = this.upgradeChains.find((chain) => chain.id === chainId);
        if (existing && canonicalStringify(existing.itemIds) === canonicalStringify(itemIds)) return;

        this.upgradeChains = existing
            ? this.upgradeChains.map((chain) => (chain.id === chainId ? { ...chain, itemIds } : chain))
            : [...this.upgradeChains, { id: chainId, itemIds }];
        this.dirtyUpgradeChainIds.add(chainId);
        this.notify();
    }

    /**
     * Unlinks a tier from its chain. Deliberately does **not** delete the item — an item dropped from a chain is
     * still real content that exists on its own, and deleting it here would be a much bigger, unasked-for action.
     */
    removeItemFromChain(chainId: string, itemId: string): void {
        const chain = this.upgradeChains.find((entry) => entry.id === chainId);
        if (!chain) return;
        this.setUpgradeChain(chainId, chain.itemIds.filter((tierId) => tierId !== itemId));
    }

    /**
     * Builds the next tier for a chain: a copy of `itemId` (columns, tags, description and mechanics), named
     * after the chain's current last tier with one more "+" — matching the game's own Вор/Вор+/Вор++ convention
     * that copyNameToUpgrades already follows. The new id continues the real `..._1`/`_2`/`_3` numbering where
     * the source uses it, and falls back to appending a counter, skipping ids already taken.
     */
    createNextTier(itemId: string): string | undefined {
        const source = this.getItem(itemId);
        if (!source) return undefined;

        const chain = this.chainForItem(itemId);
        const tierIds = chain?.itemIds ?? [itemId];
        const lastTier = this.getItem(tierIds[tierIds.length - 1]);
        const newId = this.nextTierId(tierIds[tierIds.length - 1]);

        const raw = { ...source.raw };
        delete raw.ItemId;
        this.upsertItem(newId, source.itemType ?? "Card", { tags: [...source.tags], raw });

        const newItem = this.getItem(newId);
        if (newItem) {
            this.setTranslationOverride(
                newItem.nameKey ?? newId,
                `${lastTier ? this.itemName(lastTier) : this.itemName(source)}+`
            );
            const description = this.itemDescription(source);
            if (description) this.setTranslationOverride(newItem.descKey ?? `${newId}_desc`, description);
        }

        for (const row of this.mechanics.filter((mechanic) => mechanic.itemId === itemId)) {
            this.upsertMechanicRow({
                id: `content:tier:${newId}:${row.table}:${row.id}`,
                table: row.table,
                itemId: newId,
                fields: { ...row.fields },
            });
        }

        // A chain of one isn't stored as a chain at all, so the first generated tier creates it.
        this.setUpgradeChain(chain?.id ?? `up_${itemId}`, [...tierIds, newId]);
        return newId;
    }

    /** `c_thief_1` -> `c_thief_2`; anything else gets a `_2` suffix. Keeps counting until the id is free. */
    private nextTierId(lastTierId: string): string {
        const match = lastTierId.match(/^(.*_)(\d+)$/);
        const prefix = match ? match[1] : `${lastTierId}_`;
        let next = match ? Number(match[2]) + 1 : 2;
        while (this.getItem(`${prefix}${next}`)) next++;
        return `${prefix}${next}`;
    }

    /** Whether this item's id can still be changed — see locallyCreatedItemIds. */
    canRenameItem(itemId: string): boolean {
        return this.locallyCreatedItemIds.has(itemId);
    }

    /**
     * Renames an item that only exists on the site. The id is the key every table joins on, so this has to move
     * every reference with it: the item's own row and translation keys, its mechanic rows, its place in an
     * upgrade chain, replace rules on either side, its manual icon, and any mechanic field pointing at it by id
     * (UseTargetIds and friends). Refuses when the sheet already knows the id, or the new one is taken.
     */
    renameItem(oldId: string, newId: string): { ok: boolean; error?: string } {
        const trimmed = newId.trim();
        const item = this.getItem(oldId);

        if (!item) return { ok: false, error: "Предмет не найден" };
        if (!trimmed) return { ok: false, error: "Id не может быть пустым" };
        if (trimmed === oldId) return { ok: true };
        if (this.getItem(trimmed)) return { ok: false, error: "Такой id уже есть" };
        if (!this.canRenameItem(oldId)) {
            return { ok: false, error: "Предмет уже выгружен в таблицу — id менять нельзя" };
        }

        // Translation keys follow the id by convention (`<id>` / `<id>_desc`), so carry the texts across rather
        // than leaving them stranded under the old keys.
        const oldNameKey = item.nameKey ?? oldId;
        const oldDescKey = item.descKey ?? `${oldId}_desc`;
        const name = this.translationOverrides[oldNameKey] ?? this.getTranslation(oldNameKey);
        const description = this.translationOverrides[oldDescKey] ?? this.getTranslation(oldDescKey);

        this.allItems = this.allItems.map((entry) =>
            entry.id === oldId
                ? {
                      ...entry,
                      id: trimmed,
                      nameKey: trimmed,
                      descKey: `${trimmed}_desc`,
                      raw: { ...entry.raw, ItemId: trimmed },
                  }
                : entry
        );

        this.mechanics = this.mechanics.map((row) => {
            const fields = Object.fromEntries(
                Object.entries(row.fields).map(([column, value]) => [column, value === oldId ? trimmed : value])
            );
            return row.itemId === oldId ? { ...row, itemId: trimmed, fields } : { ...row, fields };
        });

        this.upgradeChains = this.upgradeChains.map((chain) =>
            chain.itemIds.includes(oldId)
                ? { ...chain, itemIds: chain.itemIds.map((tierId) => (tierId === oldId ? trimmed : tierId)) }
                : chain
        );
        for (const chain of this.upgradeChains) {
            if (chain.itemIds.includes(trimmed)) this.dirtyUpgradeChainIds.add(chain.id);
        }

        this.replaceRules = this.replaceRules.map((rule) => ({
            ...rule,
            itemIdToReplace: rule.itemIdToReplace === oldId ? trimmed : rule.itemIdToReplace,
            replacementItem: rule.replacementItem === oldId ? trimmed : rule.replacementItem,
        }));
        if (this.dirtyReplaceSourceIds.delete(oldId)) this.dirtyReplaceSourceIds.add(trimmed);

        const icon = this.itemIcons[oldId];

        this.locallyCreatedItemIds.delete(oldId);
        this.locallyCreatedItemIds.add(trimmed);
        this.dirtyItemIds.delete(oldId);
        this.dirtyItemIds.add(trimmed);
        const originalRaw = this.originalItemRaw.get(oldId);
        if (originalRaw) {
            this.originalItemRaw.delete(oldId);
            this.originalItemRaw.set(trimmed, originalRaw);
        }

        this.rebuildDerivedCaches();
        this.notify();

        // Firestore-backed side data moves after the local state, each through its own point-update.
        if (name) this.setTranslationOverride(trimmed, name);
        if (description) this.setTranslationOverride(`${trimmed}_desc`, description);
        this.setTranslationOverride(oldNameKey, "");
        this.setTranslationOverride(oldDescKey, "");
        if (icon) {
            this.setItemIcon(trimmed, icon);
            this.setItemIcon(oldId, "");
        }

        return { ok: true };
    }

    /** Adds an empty mechanic row of `table` to an item. Its id is site-generated, so the export appends it. */
    addMechanicRow(itemId: string, table: MechanicTableName): MechanicRow {
        const row: MechanicRow = { id: `content:new:${table}:${itemId}:${this.nextRowSeq++}`, table, itemId, fields: {} };
        this.upsertMechanicRow(row);
        return row;
    }

    /**
     * Removes a mechanic row. A row created here just disappears; a row that came from the sheet is additionally
     * recorded so the export can delete that sheet row too — otherwise it would reappear on the next import,
     * which is the same silent desync that made mechanic edits look like they weren't applying.
     */
    deleteMechanicRow(rowId: string): void {
        const row = this.mechanics.find((entry) => entry.id === rowId);
        if (!row) return;

        if (this.newMechanicRowIds.has(rowId)) {
            this.newMechanicRowIds.delete(rowId);
        } else {
            // Ordinal has to be read before the row leaves the list, and identifies it the same way an in-place
            // update does (position among that item's rows in that table).
            const ordinal = this.mechanics
                .filter((entry) => entry.table === row.table && entry.itemId === row.itemId)
                .findIndex((entry) => entry.id === rowId);
            if (ordinal >= 0) {
                this.deletedMechanicRows.push({
                    table: row.table,
                    itemId: row.itemId,
                    ordinal,
                    originalFields: this.originalMechanicFields.get(rowId) ?? { ...row.fields },
                });
            }
        }

        this.editedMechanicRowIds.delete(rowId);
        this.originalMechanicFields.delete(rowId);
        this.mechanics = this.mechanics.filter((entry) => entry.id !== rowId);
        this.notify();
    }

    /** Creates or updates one replace rule and marks its source item for export. */
    upsertReplaceRule(rule: ReplaceRule): void {
        const existing = this.replaceRules.find((entry) => entry.id === rule.id);
        if (existing && canonicalStringify(existing) === canonicalStringify(rule)) return;

        this.replaceRules = existing
            ? this.replaceRules.map((entry) => (entry.id === rule.id ? rule : entry))
            : [...this.replaceRules, rule];
        this.dirtyReplaceSourceIds.add(rule.itemIdToReplace);
        this.notify();
    }

    /** Drops one replace rule. Its source item is marked so the export rewrites that item's rows without it. */
    deleteReplaceRule(ruleId: string): void {
        const rule = this.replaceRules.find((entry) => entry.id === ruleId);
        if (!rule) return;
        this.replaceRules = this.replaceRules.filter((entry) => entry.id !== ruleId);
        this.dirtyReplaceSourceIds.add(rule.itemIdToReplace);
        this.notify();
    }

    /** Reverses any real [img]/[color] BBCode or literal glossary emoji a translator typed straight into the
     *  Sheet back into the site's own editable form ({item:ID}/{tag:Name}/glossary phrase text) — see
     *  importText.ts's doc. Runs against whatever items/tagIcons/glossary are current at call time; applyImportResult
     *  always calls this after `this.allItems` has already been reassigned for the same import, so a combined
     *  config+translations import sees the freshly-imported items, not the stale previous set. */
    private reverseImportedIcons(translations: Translation[]): Translation[] {
        const importContext = {
            items: this.allItems,
            itemIcons: this.itemIcons,
            tagIcons: this.tagIcons,
            glossary: this.glossary,
        };
        return translations.map((translation) => ({
            ...translation,
            value: buildImportDescriptionText(translation.value, importContext),
        }));
    }

    /**
     * `scope` matters only for a non-merge (full replace) apply: "config" replaces every config-derived field
     * (items/mechanics/upgradeChains/replaceRules/enumValues) but leaves `translations` untouched, "translations"
     * is the mirror image, and omitting it (the CSV-merge path aside) replaces everything — used by importConfig/
     * importTranslations so re-downloading just one table can never wipe out the other one's already-loaded data,
     * which is what a plain full-replace would do since a config-only fetch's `result.data.translations` is
     * simply empty (no Translations-shaped table was ever fetched), not "the translations were cleared."
     */
    /**
     * A translation override exists so a site-side edit can win over the sheet *until it's exported*. Once it
     * has been exported the sheet holds that exact text, so the override is redundant — but it keeps winning
     * forever, which means a later edit made directly in the sheet is silently ignored: the download looks like
     * it "didn't apply", and on a page load the correct sheet text renders first and is then replaced by the
     * stale override as soon as Firestore delivers it.
     *
     * So after a fresh translations import, retire every override that still matches what was last exported —
     * the sheet is authoritative for those now. Deliberately narrow on two counts: an override that *differs*
     * from `exportedOverrides` is a local edit that was never sent and must survive, and a key the import
     * didn't deliver is left alone too (dropping it would lose text that exists nowhere else).
     */
    private dropOverridesSupersededByImport(): void {
        const importedKeys = new Set(this.translations.map((translation) => translation.key));

        const nextOverrides = { ...this.translationOverrides };
        const nextExported = { ...this.exportedOverrides };
        let retired = 0;

        for (const [key, value] of Object.entries(this.translationOverrides)) {
            if (!importedKeys.has(key)) continue;
            if (this.exportedOverrides[key] !== value) continue;
            delete nextOverrides[key];
            delete nextExported[key];
            retired++;
        }

        if (retired === 0) return;

        this.translationOverrides = nextOverrides;
        this.exportedOverrides = nextExported;
        void replaceTranslationOverridesRemote(nextOverrides).catch((error) =>
            console.error("dropOverridesSupersededByImport → Firestore", error)
        );
        void replaceExportedOverridesRemote(nextExported).catch((error) =>
            console.error("dropOverridesSupersededByImport → Firestore", error)
        );
    }

    /** An id the sheet now supplies isn't a local draft any more, however it got into the set — so its row
     *  exists upstream and renaming it here would orphan that row. Keeps canRenameItem() honest across imports. */
    private forgetLocallyCreated(importedItems: Item[]): void {
        for (const item of importedItems) this.locallyCreatedItemIds.delete(item.id);
    }

    private applyImportResult(result: ImportResult, options?: { merge?: boolean; scope?: "config" | "translations" }): void {
        if (options?.merge) {
            this.allItems = mergeById(this.allItems, result.data.items);
            this.forgetLocallyCreated(result.data.items);
            this.translations = mergeByKey(this.translations, this.reverseImportedIcons(result.data.translations));
            this.mechanics = mergeById(this.mechanics, result.data.mechanics);
            this.upgradeChains = mergeById(this.upgradeChains, result.data.upgradeChains);
            this.rounds = mergeById(this.rounds, result.data.rounds);
            this.decks = mergeById(this.decks, result.data.decks);
            this.packs = mergeById(this.packs, result.data.packs);
            this.balls = mergeById(this.balls, result.data.balls);
            this.ballGroups = mergeById(this.ballGroups, result.data.ballGroups);
            this.sprints = mergeById(this.sprints, result.data.sprints);
            this.shops = mergeById(this.shops, result.data.shops);
            this.replaceRules = mergeById(this.replaceRules, result.data.replaceRules);
            this.enumValues = mergeParamValueSources(this.enumValues, result.data.enumValues);
        } else {
            if (options?.scope !== "translations") {
                this.allItems = result.data.items;
                this.forgetLocallyCreated(result.data.items);
                this.mechanics = result.data.mechanics;
                this.upgradeChains = result.data.upgradeChains;
                this.rounds = result.data.rounds;
                this.decks = result.data.decks;
                this.packs = result.data.packs;
                this.balls = result.data.balls;
                this.ballGroups = result.data.ballGroups;
                this.sprints = result.data.sprints;
                this.shops = result.data.shops;
                this.replaceRules = result.data.replaceRules;
                this.enumValues = result.data.enumValues;
            }
            if (options?.scope !== "config") {
                this.translations = this.reverseImportedIcons(result.data.translations);
                this.dropOverridesSupersededByImport();
            }
        }

        this.rebuildDerivedCaches();
        this.importReport = result.report;
        this.importedAt = new Date().toISOString();
        saveImportCache({
            items: this.allItems,
            translations: this.translations,
            mechanics: this.mechanics,
            upgradeChains: this.upgradeChains,
            rounds: this.rounds,
            decks: this.decks,
            packs: this.packs,
            balls: this.balls,
            ballGroups: this.ballGroups,
            sprints: this.sprints,
            shops: this.shops,
            replaceRules: this.replaceRules,
            enumValues: this.enumValues,
        });
    }

    private async runImport(
        result: () => Promise<ImportResult>,
        applyOptions: { merge?: boolean; scope?: "config" | "translations" }
    ): Promise<void> {
        this.importing = true;
        this.importError = null;
        this.notify();

        try {
            this.applyImportResult(await result(), applyOptions);
        } catch (error) {
            this.importError = error instanceof Error ? error.message : String(error);
        } finally {
            this.importing = false;
            this.notify();
        }
    }

    /** Re-downloads only the config source (Cards/Houses/Artefacts, Mech-tables, CardUpgrades, ...) — existing
     *  translations are left exactly as they were, so this can be re-run on its own after a config-only edit. */
    async importConfig(configUrl: string): Promise<void> {
        this.sources = { ...this.sources, configUrl };
        this.notify();
        void updateSourceConfigUrlRemote(configUrl).catch((error) => console.error("importConfig → Firestore", error));

        await this.runImport(() => this.importService.importFromUrls({ configUrl }), { scope: "config" });
    }

    /** Re-downloads only the translations source (item_name/item_desc) — existing config-derived data (items,
     *  mechanics, etc.) is left exactly as it was, so this can be re-run on its own after a translations-only edit. */
    async importTranslations(translationsUrl: string): Promise<void> {
        this.sources = { ...this.sources, translationsUrl };
        this.notify();
        void updateSourceTranslationsUrlRemote(translationsUrl).catch((error) =>
            console.error("importTranslations → Firestore", error)
        );

        await this.runImport(() => this.importService.importFromUrls({ translationsUrl }), { scope: "translations" });
    }

    async importCsvFiles(files: File[]): Promise<void> {
        await this.runImport(() => this.importService.importCsvFiles(files), { merge: true });
    }

    /**
     * Wipes the entire imported config/translations cache (items, mechanics, upgradeChains, rounds, decks, packs,
     * balls, ballGroups, sprints, replaceRules, enumValues, translations) back to empty, local to this browser only — builds/icons/etc. in Firestore are
     * untouched. Exists specifically because CSV uploads always merge by id (`importCsvFiles` above) and never
     * remove anything missing from a new file, so an item deleted from the source spreadsheet lingers on the site
     * forever unless the whole cache is cleared first. After clearing, the next CSV upload or "Скачать
     * конфиг"/"Скачать переводы" starts from a clean slate — no leftover ids from before this call can survive.
     */
    clearImportCache(): void {
        this.allItems = [];
        this.translations = [];
        this.mechanics = [];
        this.upgradeChains = [];
        this.rounds = [];
        this.decks = [];
        this.packs = [];
        this.balls = [];
        this.ballGroups = [];
        this.sprints = [];
        this.shops = [];
        this.replaceRules = [];
        this.enumValues = {};
        this.rebuildDerivedCaches();
        this.importReport = null;
        this.importedAt = null;
        saveImportCache(null);
        this.notify();
    }

    createBuild(name = ""): Build {
        const build: Build = {
            id: `build-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            items: [],
        };
        this.builds = [...this.builds, build];
        this.notify();
        void writeBuild(build).catch((error) => console.error("createBuild → Firestore", error));
        return build;
    }

    upsertBuild(build: Build): void {
        const exists = this.builds.some((entry) => entry.id === build.id);
        this.builds = exists
            ? this.builds.map((entry) => (entry.id === build.id ? build : entry))
            : [...this.builds, build];
        this.notify();
        void writeBuild(build).catch((error) => console.error("upsertBuild → Firestore", error));
    }

    deleteBuild(id: string): void {
        this.builds = this.builds.filter((build) => build.id !== id);
        this.notify();
        void deleteBuildDoc(id).catch((error) => console.error("deleteBuild → Firestore", error));
    }

    /** Deletes every build still marked "Черновик" (auto: true, never edited/saved by the user). Returns how many were removed. */
    deleteAllDrafts(): number {
        const removedIds = this.builds.filter((build) => build.auto).map((build) => build.id);
        this.builds = this.builds.filter((build) => !build.auto);
        this.notify();
        void deleteBuildsBatch(removedIds).catch((error) => console.error("deleteAllDrafts → Firestore", error));
        return removedIds.length;
    }

    addItemToBuild(buildId: string, itemId: string): void {
        this.builds = this.builds.map((build) =>
            build.id === buildId && !build.items.includes(itemId)
                ? { ...build, items: [...build.items, itemId] }
                : build
        );
        this.notify();
        void addItemToBuildRemote(buildId, itemId).catch((error) =>
            console.error("addItemToBuild → Firestore", error)
        );
    }

    removeItemFromBuild(buildId: string, itemId: string): void {
        this.builds = this.builds.map((build) =>
            build.id === buildId ? { ...build, items: build.items.filter((id) => id !== itemId) } : build
        );
        this.notify();
        void removeItemFromBuildRemote(buildId, itemId).catch((error) =>
            console.error("removeItemFromBuild → Firestore", error)
        );
    }

    /** Manual build<->build link, kept symmetric on both sides. */
    linkBuilds(buildIdA: string, buildIdB: string): void {
        if (buildIdA === buildIdB) return;
        this.builds = this.builds.map((build) => {
            const otherId = build.id === buildIdA ? buildIdB : build.id === buildIdB ? buildIdA : null;
            if (!otherId || (build.manualLinks ?? []).includes(otherId)) return build;
            return { ...build, manualLinks: [...(build.manualLinks ?? []), otherId] };
        });
        this.notify();
        void linkBuildsRemote(buildIdA, buildIdB).catch((error) => console.error("linkBuilds → Firestore", error));
    }

    unlinkBuilds(buildIdA: string, buildIdB: string): void {
        this.builds = this.builds.map((build) => {
            const otherId = build.id === buildIdA ? buildIdB : build.id === buildIdB ? buildIdA : null;
            if (!otherId) return build;
            return { ...build, manualLinks: (build.manualLinks ?? []).filter((id) => id !== otherId) };
        });
        this.notify();
        void unlinkBuildsRemote(buildIdA, buildIdB).catch((error) =>
            console.error("unlinkBuilds → Firestore", error)
        );
    }

    /**
     * Items/mechanics to feed the build-generation algorithms. Excludes upgrade tiers (+/++) by default — a "+"
     * item is just a power-scaled clone of its base, and letting it independently pull in tag/id connections
     * tends to just duplicate the base item's draft rather than surface anything new. Mechanics are filtered
     * alongside items (not just items) so an excluded tier's own mechanic rows can't leak back in through
     * reverse-lookup indices (e.g. "who spawns/activates X") inside the generation algorithms.
     */
    private itemsForBuildGeneration(includeUpgradeTiers: boolean): { items: Item[]; mechanics: MechanicRow[] } {
        if (includeUpgradeTiers) return { items: this.items, mechanics: this.mechanics };

        const excluded = computeUpgradeTierIds(this.items, this.upgradeChains, (item) => this.itemName(item));
        const items = this.items.filter((item) => !excluded.has(item.id));
        const mechanics = this.mechanics.filter((mechanic) => !excluded.has(mechanic.itemId));
        return { items, mechanics };
    }

    /** Runs the tag/id clustering pass and appends new draft builds (deduped against existing ones). */
    suggestBuilds(includeUpgradeTiers = false): number {
        const { items, mechanics } = this.itemsForBuildGeneration(includeUpgradeTiers);
        const drafts = computeSuggestedBuilds(items, mechanics, this.upgradeChains, this.replaceRules, this.builds);
        this.builds = [...this.builds, ...drafts];
        this.notify();
        void writeBuildsBatch(drafts).catch((error) => console.error("suggestBuilds → Firestore", error));
        return drafts.length;
    }

    /** Runs the PlayerScore-cascade pass (Activator/Bonus/spawn chains, not tag-clustering) and appends new draft builds. */
    suggestCascadeBuilds(includeUpgradeTiers = false, includeMoneyValueRoots = false): number {
        const { items, mechanics } = this.itemsForBuildGeneration(includeUpgradeTiers);
        const drafts = computeCascadeBuilds(
            items,
            mechanics,
            this.replaceRules,
            this.builds,
            (item) => this.itemName(item),
            includeMoneyValueRoots
        );
        this.builds = [...this.builds, ...drafts];
        this.notify();
        void writeBuildsBatch(drafts).catch((error) => console.error("suggestCascadeBuilds → Firestore", error));
        return drafts.length;
    }

    /** Passing "" — or the bare placeholder, which is the same thing to look at but would outrank and hide the
     *  item's sprite — clears the manual icon rather than storing it. See normalizeItemIcons. */
    setItemIcon(itemId: string, icon: string): void {
        const next = icon.trim() === PLACEHOLDER_ITEM_ICON ? "" : icon;

        if (next) {
            this.itemIcons = { ...this.itemIcons, [itemId]: next };
        } else {
            const remaining = { ...this.itemIcons };
            delete remaining[itemId];
            this.itemIcons = remaining;
        }

        this.notify();
        void updateItemIconRemote(itemId, next).catch((error) => console.error("setItemIcon → Firestore", error));
    }

    getDeckName(deckId: string): string | undefined {
        return this.deckNames[deckId];
    }

    /** Point-update, like setItemIcon — a display name for a Deck/DecksShop/BallGroup id, pure site-side
     *  convenience never exported. Empty string clears the name entirely (see updateDeckNameRemote). */
    setDeckName(deckId: string, name: string): void {
        const trimmed = name.trim();
        this.deckNames = trimmed
            ? { ...this.deckNames, [deckId]: trimmed }
            : Object.fromEntries(Object.entries(this.deckNames).filter(([id]) => id !== deckId));
        this.notify();
        void updateDeckNameRemote(deckId, trimmed).catch((error) => console.error("setDeckName → Firestore", error));
    }

    /** Effective number of stage columns the SprintDetailPage board shows — the stored override (defaulting to 1)
     *  widened to fit every real Stage value already present, so real data is never hidden even if the override
     *  is stale (e.g. a round was pushed into a higher stage from elsewhere and the override was never bumped). */
    getSprintStageCount(sprintId: string): number {
        const stored = this.sprintStageCounts[sprintId] ?? 1;
        const sprint = this.getSprint(sprintId);
        const highestRealStage = sprint ? Math.max(1, ...sprint.rounds.map((round) => round.stage ?? 1)) : 1;
        return Math.max(stored, highestRealStage);
    }

    /** Point-update, like setDeckName — a site-only "how many stage columns to show" override, never exported
     *  (there's no MaxStages column in the real sheet). */
    setSprintStageCount(sprintId: string, count: number): void {
        this.sprintStageCounts = { ...this.sprintStageCounts, [sprintId]: count };
        this.notify();
        void updateSprintStageCountRemote(sprintId, count).catch((error) =>
            console.error("setSprintStageCount → Firestore", error)
        );
    }

    addCustomParamValue(dimension: string, value: string): void {
        const trimmed = value.trim();
        if (!trimmed) return;
        const existing = this.customParamValues[dimension] ?? [];
        if (existing.includes(trimmed)) return;
        this.customParamValues = { ...this.customParamValues, [dimension]: [...existing, trimmed] };
        this.notify();
        void addCustomParamValueRemote(dimension, trimmed).catch((error) =>
            console.error("addCustomParamValue → Firestore", error)
        );
    }

    setDescriptionSettings(settings: DescriptionSettings): void {
        this.descriptionSettings = settings;
        this.notify();
        void updateDescriptionSettingsRemote(settings).catch((error) =>
            console.error("setDescriptionSettings → Firestore", error)
        );
    }

    setContentSettings(settings: ContentSettings): void {
        this.contentSettings = settings;
        this.notify();
        void updateContentSettingsRemote(settings).catch((error) =>
            console.error("setContentSettings → Firestore", error)
        );
    }

    setBalanceConfig(config: BalanceConfig): void {
        this.balanceConfig = config;
        this.notify();
        void updateBalanceConfigRemote(config).catch((error) => console.error("setBalanceConfig → Firestore", error));
    }

    /** Full replace, called after every add/edit/delete on the Glossary page — the whole list is small and
     *  hand-curated, so there's no point-update path like itemIcons has. */
    setGlossary(entries: GlossaryEntry[]): void {
        this.glossary = entries;
        this.notify();
        void replaceGlossaryRemote(entries).catch((error) => console.error("setGlossary → Firestore", error));
    }

    /** Full replace, same reasoning as setGlossary — the tag→icon list is small and hand-curated. */
    setTagIcons(entries: TagIcon[]): void {
        this.tagIcons = entries;
        this.notify();
        void replaceTagIconsRemote(entries).catch((error) => console.error("setTagIcons → Firestore", error));
    }

    /** Full replace, same reasoning as setTagIcons — see SpecialRoundTypesPopover. */
    setSpecialRoundTypes(values: string[]): void {
        this.specialRoundTypes = values;
        this.notify();
        void replaceSpecialRoundTypesRemote(values).catch((error) =>
            console.error("setSpecialRoundTypes → Firestore", error)
        );
    }

    /** Everything a BalanceSave captures, read straight from live state — see BalanceSavePayload for why `sources`
     *  is deliberately excluded. */
    currentBalancePayload(): BalanceSavePayload {
        return {
            items: this.allItems,
            translations: this.translations,
            mechanics: this.mechanics,
            upgradeChains: this.upgradeChains,
            rounds: this.rounds,
            decks: this.decks,
            packs: this.packs,
            balls: this.balls,
            ballGroups: this.ballGroups,
            sprints: this.sprints,
            shops: this.shops,
            replaceRules: this.replaceRules,
            enumValues: this.enumValues,
            builds: this.builds,
            itemIcons: this.itemIcons,
            customParamValues: this.customParamValues,
            descriptionSettings: this.descriptionSettings,
            balanceConfig: this.balanceConfig,
            translationOverrides: this.translationOverrides,
            exportedOverrides: this.exportedOverrides,
            glossary: this.glossary,
            tagIcons: this.tagIcons,
            specialRoundTypes: this.specialRoundTypes,
            deckNames: this.deckNames,
            sprintStageCounts: this.sprintStageCounts,
        };
    }

    /** False whenever the live balance differs from whichever BalanceSave was last created or restored in this
     *  browser — SavesPage uses this to decide whether restoring a *different* save needs the "are you sure, your
     *  current changes aren't saved" warning. Not a true "does this match *any* save" check (that would need
     *  fetching every save's full payload) — see localStore.ts's getLastSavedBalanceSnapshot doc comment. */
    isCurrentBalanceSaved(): boolean {
        return canonicalStringify(this.currentBalancePayload()) === getLastSavedBalanceSnapshot();
    }

    async createBalanceSave(name: string, description: string): Promise<BalanceSaveMeta> {
        const payload = this.currentBalancePayload();
        const meta = await createBalanceSaveRemote(name, description, payload);
        saveLastSavedBalanceSnapshot(canonicalStringify(payload));
        return meta;
    }

    /** Only allowed when running locally (`npm run dev`) — same restriction/precedent as SourcesPage's sprite-
     *  loading button, here to guard against an accidental delete of shared team saves from the deployed site.
     *  SavesPage's own delete button is disabled to match; this check is a second line of defense, not the only
     *  one — same "shared-team deterrent, not real security" posture as the rest of this app (no user login). */
    deleteBalanceSave(id: string): void {
        if (!import.meta.env.DEV) {
            console.error("deleteBalanceSave: only allowed when running locally (npm run dev)");
            return;
        }
        void deleteBalanceSaveRemote(id).catch((error) => console.error("deleteBalanceSave → Firestore", error));
    }

    /**
     * Full replace with a previously-saved balance — mirrors importSnapshot's shape exactly (config/translations
     * go to this browser's local importCache only, same as a fresh Google Sheets download would; everything else
     * is shared Firestore state and gets pushed for every collaborator to see). `sources` is deliberately read
     * back from the *current* live value instead — restoring a balance shouldn't repoint where config is
     * downloaded from, see BalanceSavePayload's own doc.
     */
    async restoreBalanceSave(id: string): Promise<void> {
        const payload = await fetchBalanceSavePayloadRemote(id);

        this.allItems = payload.items;
        this.translations = payload.translations;
        this.mechanics = payload.mechanics;
        this.upgradeChains = payload.upgradeChains;
        this.rounds = payload.rounds;
        this.decks = payload.decks;
        this.packs = payload.packs;
        this.balls = payload.balls;
        this.ballGroups = payload.ballGroups;
        this.sprints = payload.sprints;
        this.shops = payload.shops ?? [];
        this.replaceRules = payload.replaceRules;
        this.enumValues = payload.enumValues;
        this.rebuildDerivedCaches();
        this.importedAt = new Date().toISOString();
        saveImportCache({
            items: payload.items,
            translations: payload.translations,
            mechanics: payload.mechanics,
            upgradeChains: payload.upgradeChains,
            rounds: payload.rounds,
            decks: payload.decks,
            packs: payload.packs,
            balls: payload.balls,
            ballGroups: payload.ballGroups,
            sprints: payload.sprints,
            shops: payload.shops,
            replaceRules: payload.replaceRules,
            enumValues: payload.enumValues,
        });

        saveLastSavedBalanceSnapshot(canonicalStringify(payload));
        this.notify();

        await Promise.all([
            replaceAllBuilds(payload.builds),
            replaceSharedState({
                itemIcons: payload.itemIcons,
                customParamValues: payload.customParamValues,
                sources: this.sources,
                descriptionSettings: payload.descriptionSettings,
                translationOverrides: payload.translationOverrides,
                exportedOverrides: payload.exportedOverrides,
                balanceConfig: payload.balanceConfig,
                contentSettings: this.contentSettings,
                deckNames: payload.deckNames,
                sprintStageCounts: payload.sprintStageCounts,
            }),
            replaceGlossaryRemote(payload.glossary),
            replaceTagIconsRemote(payload.tagIcons),
            replaceSpecialRoundTypesRemote(payload.specialRoundTypes),
        ]);
    }

    exportSnapshot(): void {
        writeSnapshotFile({
            builds: this.builds,
            itemIcons: this.itemIcons,
            customParamValues: this.customParamValues,
            sources: this.sources,
            descriptionSettings: this.descriptionSettings,
            translationOverrides: this.translationOverrides,
            exportedOverrides: this.exportedOverrides,
            balanceConfig: this.balanceConfig,
            deckNames: this.deckNames,
            sprintStageCounts: this.sprintStageCounts,
            importCache: {
                items: this.allItems,
                translations: this.translations,
                mechanics: this.mechanics,
                upgradeChains: this.upgradeChains,
                rounds: this.rounds,
                decks: this.decks,
                packs: this.packs,
                balls: this.balls,
                ballGroups: this.ballGroups,
                sprints: this.sprints,
                shops: this.shops,
                replaceRules: this.replaceRules,
                enumValues: this.enumValues,
            },
            importCacheTimestamp: this.importedAt,
        });
    }

    /** Full replace of the shared Firestore state (builds + itemIcons + customParamValues + sources) for everyone — not a merge. */
    async importSnapshot(file: File): Promise<void> {
        const state = await parseSnapshotFile(file);

        await Promise.all([
            replaceAllBuilds(state.builds),
            replaceSharedState({
                itemIcons: state.itemIcons,
                customParamValues: state.customParamValues,
                sources: state.sources,
                descriptionSettings: state.descriptionSettings,
                translationOverrides: state.translationOverrides,
                exportedOverrides: state.exportedOverrides,
                balanceConfig: state.balanceConfig,
                contentSettings: this.contentSettings,
                deckNames: state.deckNames,
                sprintStageCounts: state.sprintStageCounts,
            }),
        ]);

        this.importedAt = state.importCacheTimestamp;
        if (state.importCache) {
            this.allItems = state.importCache.items;
            this.translations = state.importCache.translations;
            this.mechanics = state.importCache.mechanics;
            this.upgradeChains = state.importCache.upgradeChains ?? [];
            this.rounds = state.importCache.rounds ?? [];
            this.decks = state.importCache.decks ?? [];
            this.packs = state.importCache.packs ?? [];
            this.balls = state.importCache.balls ?? [];
            this.ballGroups = state.importCache.ballGroups ?? [];
            this.sprints = state.importCache.sprints ?? [];
            this.shops = state.importCache.shops ?? [];
            this.replaceRules = state.importCache.replaceRules ?? [];
            this.enumValues = state.importCache.enumValues ?? {};
            saveImportCache(state.importCache);
            this.rebuildDerivedCaches();
        }

        this.notify();
    }

    /** True once it's safe to offer the one-time "move my local builds into Firestore" banner. */
    canMigrateLegacyData(): boolean {
        if (isMigratedToFirestore()) return false;
        if (!this.buildsReady || this.builds.length > 0) return false;

        const legacy = readLegacyLocalState();
        return (
            legacy.builds.length > 0 ||
            Object.keys(legacy.itemIcons).length > 0 ||
            Object.keys(legacy.customParamValues).length > 0 ||
            Boolean(legacy.sources.configUrl || legacy.sources.translationsUrl)
        );
    }

    async migrateLegacyData(): Promise<"migrated" | "skipped-not-empty"> {
        const result = await migrateIfEmpty(readLegacyLocalState());
        if (result === "migrated") markMigratedToFirestore();
        return result;
    }

}
