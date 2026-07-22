import type { Item } from "./models/Item";
import type { Build } from "./models/Build";
import type { Translation } from "./models/Translation";
import type { MechanicRow } from "./models/Mechanic";
import type { UpgradeChain } from "./models/UpgradeChain";
import type { ReplaceRule } from "./models/ReplaceRule";
import type { GlossaryEntry } from "./models/GlossaryEntry";

import { ItemService } from "./services/ItemService";
import { BuildService } from "./services/BuildService";
import { ImportService, type ImportReport, type ImportResult } from "./services/ImportService";

import { computeSuggestedBuilds, computeCascadeBuilds, higherTierIds } from "./domain/relations";
import { deriveParamValues, mergeParamValueSources } from "./domain/paramRegistry";
import { DEFAULT_DESCRIPTION_SETTINGS, type DescriptionSettings } from "./domain/descriptionTemplate";

import {
    loadImportCache,
    saveImportCache,
    readLegacyLocalState,
    isMigratedToFirestore,
    markMigratedToFirestore,
    exportSnapshot as writeSnapshotFile,
    parseSnapshotFile,
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
    updateSourcesRemote,
    updateDescriptionSettingsRemote,
    subscribeGlossary,
    replaceGlossaryRemote,
    replaceAllBuilds,
    replaceSharedState,
    migrateIfEmpty,
} from "./persistence/firestoreStore";

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

    replaceRules: ReplaceRule[] = [];

    enumValues: Record<string, string[]> = {};

    /** Synced live from Firestore's `builds` collection — see initRemoteSync(). */
    builds: Build[] = [];

    itemIcons: Record<string, string> = {};

    customParamValues: Record<string, string[]> = {};

    sources: SourceUrls = { configUrl: "", translationsUrl: "" };

    descriptionSettings: DescriptionSettings = DEFAULT_DESCRIPTION_SETTINGS;

    /** Manually-curated "description phrase -> icon/emoji" entries — see GlossaryPage and the "icons-emoji"
     *  description mode. Synced independently of the other shared/* docs — see initRemoteSync(). */
    glossary: GlossaryEntry[] = [];

    /** False until the first Firestore `builds` snapshot arrives — distinguishes "still loading" from "no builds yet". */
    buildsReady = false;

    /** False until the first Firestore `shared/*` snapshot arrives. */
    sharedReady = false;

    /** False until the first Firestore `shared/glossary` snapshot arrives. */
    glossaryReady = false;

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
            this.sharedReady = true;
            this.notify();
        });

        subscribeGlossary((entries) => {
            this.glossary = entries;
            this.glossaryReady = true;
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

    getTranslation(key: string | undefined): string | undefined {
        if (!key) return undefined;
        return this._translationsByKey.get(key)?.value;
    }

    itemName(item: Item): string {
        return this.getTranslation(item.nameKey) ?? item.nameKey ?? item.id;
    }

    itemDescription(item: Item): string {
        return this.getTranslation(item.descKey) ?? "";
    }

    private applyImportResult(result: ImportResult, options?: { merge?: boolean }): void {
        if (options?.merge) {
            this.allItems = mergeById(this.allItems, result.data.items);
            this.translations = mergeByKey(this.translations, result.data.translations);
            this.mechanics = mergeById(this.mechanics, result.data.mechanics);
            this.upgradeChains = mergeById(this.upgradeChains, result.data.upgradeChains);
            this.replaceRules = mergeById(this.replaceRules, result.data.replaceRules);
            this.enumValues = mergeParamValueSources(this.enumValues, result.data.enumValues);
        } else {
            this.allItems = result.data.items;
            this.translations = result.data.translations;
            this.mechanics = result.data.mechanics;
            this.upgradeChains = result.data.upgradeChains;
            this.replaceRules = result.data.replaceRules;
            this.enumValues = result.data.enumValues;
        }

        this.rebuildDerivedCaches();
        this.importReport = result.report;
        this.importedAt = new Date().toISOString();
        saveImportCache({
            items: this.allItems,
            translations: this.translations,
            mechanics: this.mechanics,
            upgradeChains: this.upgradeChains,
            replaceRules: this.replaceRules,
            enumValues: this.enumValues,
        });
    }

    async importFromSources(sources: SourceUrls): Promise<void> {
        this.sources = sources;
        this.notify();
        void updateSourcesRemote(sources).catch((error) => console.error("importFromSources → Firestore", error));

        this.importing = true;
        this.importError = null;
        this.notify();

        try {
            const result = await this.importService.importFromUrls(sources);
            this.applyImportResult(result);
        } catch (error) {
            this.importError = error instanceof Error ? error.message : String(error);
        } finally {
            this.importing = false;
            this.notify();
        }
    }

    async importCsvFiles(files: File[]): Promise<void> {
        this.importing = true;
        this.importError = null;
        this.notify();

        try {
            const result = await this.importService.importCsvFiles(files);
            this.applyImportResult(result, { merge: true });
        } catch (error) {
            this.importError = error instanceof Error ? error.message : String(error);
        } finally {
            this.importing = false;
            this.notify();
        }
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

        const excluded = new Set(higherTierIds(this.upgradeChains));
        for (const item of this.items) {
            // Some tiers (e.g. Cheerleader+/Fan+) aren't registered in CardUpgrades at all, only distinguishable
            // by their translated name ending in "+"/"++" — catch those too, not just chain membership.
            if (/\+{1,2}$/.test(this.itemName(item).trim())) excluded.add(item.id);
        }

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

    /** Full replace, called after every add/edit/delete on the Glossary page — the whole list is small and
     *  hand-curated, so there's no point-update path like itemIcons has. */
    setGlossary(entries: GlossaryEntry[]): void {
        this.glossary = entries;
        this.notify();
        void replaceGlossaryRemote(entries).catch((error) => console.error("setGlossary → Firestore", error));
    }

    exportSnapshot(): void {
        writeSnapshotFile({
            builds: this.builds,
            itemIcons: this.itemIcons,
            customParamValues: this.customParamValues,
            sources: this.sources,
            descriptionSettings: this.descriptionSettings,
            importCache: {
                items: this.allItems,
                translations: this.translations,
                mechanics: this.mechanics,
                upgradeChains: this.upgradeChains,
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
            }),
        ]);

        this.importedAt = state.importCacheTimestamp;
        if (state.importCache) {
            this.allItems = state.importCache.items;
            this.translations = state.importCache.translations;
            this.mechanics = state.importCache.mechanics;
            this.upgradeChains = state.importCache.upgradeChains ?? [];
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
