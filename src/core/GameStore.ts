import type { Item } from "./models/Item";
import type { Build } from "./models/Build";
import type { Translation } from "./models/Translation";
import type { MechanicRow } from "./models/Mechanic";
import type { UpgradeChain } from "./models/UpgradeChain";
import type { Round } from "./models/Round";
import type { Deck, DeckSource } from "./models/Deck";
import type { ReplaceRule } from "./models/ReplaceRule";
import type { GlossaryEntry } from "./models/GlossaryEntry";
import type { TagIcon } from "./models/TagIcon";
import type { BalanceSaveMeta, BalanceSavePayload } from "./models/BalanceSave";
import { DEFAULT_BALANCE_CONFIG, type BalanceConfig } from "./models/BalanceConfig";

import { ItemService } from "./services/ItemService";
import { BuildService } from "./services/BuildService";
import { ImportService, type ImportReport, type ImportResult } from "./services/ImportService";

import { computeSuggestedBuilds, computeCascadeBuilds, computeUpgradeTierIds } from "./domain/relations";
import { deriveParamValues, mergeParamValueSources } from "./domain/paramRegistry";
import { DEFAULT_DESCRIPTION_SETTINGS, getEnabledGlossaryEntries, type DescriptionSettings } from "./domain/descriptionTemplate";
import { buildExportDescriptionText } from "./domain/exportText";
import { postExportPayload, type ExportResult } from "./import/sheetSource";
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
    addCustomParamValueRemote,
    updateSourceConfigUrlRemote,
    updateSourceTranslationsUrlRemote,
    updateDescriptionSettingsRemote,
    updateBalanceConfigRemote,
    updateTranslationOverrideRemote,
    replaceExportedOverridesRemote,
    subscribeGlossary,
    replaceGlossaryRemote,
    subscribeTagIcons,
    replaceTagIconsRemote,
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

    replaceRules: ReplaceRule[] = [];

    enumValues: Record<string, string[]> = {};

    /** Synced live from Firestore's `builds` collection — see initRemoteSync(). */
    builds: Build[] = [];

    itemIcons: Record<string, string> = {};

    customParamValues: Record<string, string[]> = {};

    sources: SourceUrls = { configUrl: "", translationsUrl: "" };

    descriptionSettings: DescriptionSettings = DEFAULT_DESCRIPTION_SETTINGS;

    /** Depth coefficients + balance constants — see BalancePage's "Константы" tab and domain/balance.ts. */
    balanceConfig: BalanceConfig = DEFAULT_BALANCE_CONFIG;

    /** User-edited name/description text, keyed by translation key — wins over the imported translations table
     *  for the same key. See getTranslation()/setTranslationOverride(). */
    translationOverrides: Record<string, string> = {};

    /** Snapshot of translationOverrides as of the last successful Sheets export — see pendingExportCount. */
    exportedOverrides: Record<string, string> = {};

    /** Item ids touched via upsertItem (Blueprint Lab) since the last successful exportBlueprintChanges() —
     *  in-memory only, not persisted/synced, matching the lab's own "nothing survives a reload" framing. */
    blueprintDirtyItemIds: Set<string> = new Set();

    /** MechanicRow ids upserted via upsertMechanicRow (Blueprint Lab) since the last successful
     *  exportBlueprintChanges() — only these (never real, loaded rows) are exportable, see the method's own doc. */
    blueprintNewMechanicRowIds: Set<string> = new Set();

    /** Deck ids created/edited via upsertDeck (Decks page) since the last successful exportDeckChanges() —
     *  in-memory only, not persisted/synced, same "nothing survives a reload" framing as the Blueprint Lab sets
     *  above. Independent of blueprintDirtyItemIds/blueprintNewMechanicRowIds — a separate export flow/button. */
    blueprintDirtyDeckIds: Set<string> = new Set();

    /** Deck id -> which table it came from, for decks removed via deleteDeck since the last successful
     *  exportDeckChanges() — kept here because once a deck is filtered out of `decks`, there's no other way to
     *  know which sheet (Decks vs DecksShop) to tell "clear this DeckId's rows" on export. */
    blueprintDeletedDecks: Map<string, DeckSource> = new Map();

    /** Manually-curated "description phrase -> icon/emoji" entries — see GlossaryPage and the "icons-emoji"
     *  description mode. Synced independently of the other shared/* docs — see initRemoteSync(). */
    glossary: GlossaryEntry[] = [];

    /** Manually-curated "tag -> icon" entries, used to resolve `{tag:Name}` tokens inserted into descriptions —
     *  see GlossaryPage's "Иконки тегов" tab and descriptionTemplate.ts. Synced independently, like glossary. */
    tagIcons: TagIcon[] = [];

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

        subscribeShared((shared) => {
            this.itemIcons = shared.itemIcons;
            this.customParamValues = shared.customParamValues;
            this.sources = shared.sources;
            this.descriptionSettings = shared.descriptionSettings;
            this.translationOverrides = shared.translationOverrides;
            this.exportedOverrides = shared.exportedOverrides;
            this.balanceConfig = shared.balanceConfig;
            this.sharedReady = true;
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

    /**
     * Blueprint Lab's own write path: creates the item if `itemId` doesn't exist yet, otherwise merges `patch`
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

        this.allItems = mergeById(this.allItems, [next]);
        this.rebuildDerivedCaches();
        this.blueprintDirtyItemIds.add(trimmedId);
        this.notify();
    }

    /**
     * Upserts a mechanic row authored on the Blueprint Lab canvas (not loaded from real data) — finds an
     * existing row with the same (synthetic, `blueprint:`-prefixed) id and replaces it, otherwise appends. Safe
     * to call on every keystroke while the canvas is being edited (idempotent by id, never duplicates a row).
     * Always marked exportable — unlike updateMechanicRowFields, this id was never a real spreadsheet row, so
     * there's nothing fragile about appending it on export (see exportBlueprintChanges()'s doc).
     */
    upsertMechanicRow(row: MechanicRow): void {
        const existingIndex = this.mechanics.findIndex((r) => r.id === row.id);
        if (existingIndex >= 0) {
            this.mechanics = this.mechanics.map((r, i) => (i === existingIndex ? row : r));
        } else {
            this.mechanics = [...this.mechanics, row];
        }
        this.blueprintNewMechanicRowIds.add(row.id);
        this.notify();
    }

    /** Merges field edits into an existing mechanic row in place (Blueprint Lab) — local-only, deliberately never
     *  marked for export, see exportBlueprintChanges()'s doc. */
    updateMechanicRowFields(rowId: string, patch: Record<string, string>): void {
        this.mechanics = this.mechanics.map((row) =>
            row.id === rowId ? { ...row, fields: { ...row.fields, ...patch } } : row
        );
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
     * via setTranslationOverride) to the Apps Script's doPost endpoint — covers both items (name+description) and
     * round descriptions (see Round.descKey/RoundDetailPage; rounds have no editable name). Descriptions run
     * through buildExportDescriptionText first, converting {item:ID}/{tag:Name} tokens and whichever glossary
     * phrases the site's *current* descriptionMode/enabled settings would actually apply into real [img] BBCode —
     * matches what the site currently shows, not "every glossary entry unconditionally."
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
     * Sends every item's current name/description, and every round's current description — not just ones with a
     * site-authored override. Exists because
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

    /** How many Blueprint Lab edits haven't been sent yet — see exportBlueprintChanges(). */
    get blueprintPendingExportCount(): number {
        return this.blueprintDirtyItemIds.size + this.blueprintNewMechanicRowIds.size;
    }

    /**
     * Sends Blueprint Lab's item edits (upsert by ItemId — safe, since it's a real unique key) and brand-new
     * mechanic rows (always appended — never an update, see upsertMechanicRow's doc for why an existing row
     * can't be safely targeted) to the same Apps Script `doPost` endpoint the translation export uses, extended
     * with the `items`/`newMechanicRows` branches (see docs/apps-script-export.gs). Posts to `sources.configUrl`
     * (items/mechanics live in the config sheet), not `translationsUrl` — if those are two different
     * spreadsheets in a given deployment, the doPost extension needs to live in the config one specifically.
     */
    async exportBlueprintChanges(): Promise<ExportResult> {
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
        for (const itemId of this.blueprintDirtyItemIds) {
            const item = this.getItem(itemId);
            if (!item) continue;
            const table = itemTableByType[item.itemType ?? "Card"] ?? "Cards";
            items[table][itemId] = item.raw;
        }

        const newMechanicRows: Record<string, Record<string, string>[]> = {};
        for (const rowId of this.blueprintNewMechanicRowIds) {
            const row = this.mechanics.find((r) => r.id === rowId);
            if (!row) continue;
            (newMechanicRows[row.table] ??= []).push({ ItemId: row.itemId, ...row.fields });
        }

        const result = await postExportPayload(this.sources.configUrl, { token, names: {}, descriptions: {}, items, newMechanicRows });

        if (result.ok) {
            this.blueprintDirtyItemIds = new Set();
            this.blueprintNewMechanicRowIds = new Set();
            this.notify();
        }

        return result;
    }

    /** How many Decks-page edits haven't been sent yet — see exportDeckChanges(). Independent of
     *  blueprintPendingExportCount, a separate export flow with its own button. */
    get blueprintDeckPendingExportCount(): number {
        return this.blueprintDirtyDeckIds.size + this.blueprintDeletedDecks.size;
    }

    /**
     * Sends Decks-page edits to the same Apps Script `doPost` endpoint, extended with a `decks` branch (see
     * docs/apps-script-export.gs's replaceRowsByGroupId). Posts to `sources.configUrl`, same reasoning as
     * exportBlueprintChanges — decks live in the config sheet, not translations.
     *
     * Unlike items (upserted by a real unique ItemId) or mechanic rows (append-only, since a row has no stable
     * key), a deck's *whole row set* for its DeckId is replaced on every export — this sidesteps the "which
     * spreadsheet row is this edit for" problem entirely, since a deck is naturally edited as a cohesive unit (add/
     * remove/reorder entries) rather than one fixed row getting column patches. A deleted deck (blueprintDeletedDecks)
     * sends an empty row array for its DeckId, which the sheet-side helper treats as "clear existing rows, add
     * nothing back" — i.e. deletion, with no separate signal needed.
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

        const result = await postExportPayload(this.sources.configUrl, { token, names: {}, descriptions: {}, decks });

        if (result.ok) {
            this.blueprintDirtyDeckIds = new Set();
            this.blueprintDeletedDecks = new Map();
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
     * `scope` matters only for a non-merge (full replace) apply: "config" replaces every config-derived field
     * (items/mechanics/upgradeChains/replaceRules/enumValues) but leaves `translations` untouched, "translations"
     * is the mirror image, and omitting it (the CSV-merge path aside) replaces everything — used by importConfig/
     * importTranslations so re-downloading just one table can never wipe out the other one's already-loaded data,
     * which is what a plain full-replace would do since a config-only fetch's `result.data.translations` is
     * simply empty (no Translations-shaped table was ever fetched), not "the translations were cleared."
     */
    private applyImportResult(result: ImportResult, options?: { merge?: boolean; scope?: "config" | "translations" }): void {
        if (options?.merge) {
            this.allItems = mergeById(this.allItems, result.data.items);
            this.translations = mergeByKey(this.translations, result.data.translations);
            this.mechanics = mergeById(this.mechanics, result.data.mechanics);
            this.upgradeChains = mergeById(this.upgradeChains, result.data.upgradeChains);
            this.rounds = mergeById(this.rounds, result.data.rounds);
            this.decks = mergeById(this.decks, result.data.decks);
            this.replaceRules = mergeById(this.replaceRules, result.data.replaceRules);
            this.enumValues = mergeParamValueSources(this.enumValues, result.data.enumValues);
        } else {
            if (options?.scope !== "translations") {
                this.allItems = result.data.items;
                this.mechanics = result.data.mechanics;
                this.upgradeChains = result.data.upgradeChains;
                this.rounds = result.data.rounds;
                this.decks = result.data.decks;
                this.replaceRules = result.data.replaceRules;
                this.enumValues = result.data.enumValues;
            }
            if (options?.scope !== "config") {
                this.translations = result.data.translations;
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
     * Wipes the entire imported config/translations cache (items, mechanics, upgradeChains, rounds, decks,
     * replaceRules, enumValues, translations) back to empty, local to this browser only — builds/icons/etc. in Firestore are
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

    setItemIcon(itemId: string, icon: string): void {
        this.itemIcons = { ...this.itemIcons, [itemId]: icon };
        this.notify();
        void updateItemIconRemote(itemId, icon).catch((error) => console.error("setItemIcon → Firestore", error));
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
            replaceRules: this.replaceRules,
            enumValues: this.enumValues,
            builds: this.builds,
            itemIcons: this.itemIcons,
            customParamValues: this.customParamValues,
            descriptionSettings: this.descriptionSettings,
            translationOverrides: this.translationOverrides,
            exportedOverrides: this.exportedOverrides,
            glossary: this.glossary,
            tagIcons: this.tagIcons,
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

    deleteBalanceSave(id: string): void {
        void deleteBalanceSaveRemote(id).catch((error) => console.error("deleteBalanceSave → Firestore", error));
    }

    /**
     * Full replace with a previously-saved balance — mirrors importSnapshot's shape exactly (config/translations
     * go to this browser's local importCache only, same as a fresh Google Sheets download would; everything else
     * is shared Firestore state and gets pushed for every collaborator to see). `sources`/`balanceConfig` are read
     * back from the *current* live value rather than touched at all, since BalanceSavePayload never captured them
     * (balanceConfig didn't exist yet when this feature was built).
     */
    async restoreBalanceSave(id: string): Promise<void> {
        const payload = await fetchBalanceSavePayloadRemote(id);

        this.allItems = payload.items;
        this.translations = payload.translations;
        this.mechanics = payload.mechanics;
        this.upgradeChains = payload.upgradeChains;
        this.rounds = payload.rounds;
        this.decks = payload.decks;
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
                balanceConfig: this.balanceConfig,
            }),
            replaceGlossaryRemote(payload.glossary),
            replaceTagIconsRemote(payload.tagIcons),
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
            importCache: {
                items: this.allItems,
                translations: this.translations,
                mechanics: this.mechanics,
                upgradeChains: this.upgradeChains,
                rounds: this.rounds,
                decks: this.decks,
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
