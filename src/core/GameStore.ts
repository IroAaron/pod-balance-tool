import type { Item } from "./models/Item";
import type { Build } from "./models/Build";
import type { Translation } from "./models/Translation";
import type { MechanicRow } from "./models/Mechanic";
import type { UpgradeChain } from "./models/UpgradeChain";
import type { ReplaceRule } from "./models/ReplaceRule";

import { ItemService } from "./services/ItemService";
import { BuildService } from "./services/BuildService";
import { ImportService, type ImportReport, type ImportResult } from "./services/ImportService";

import { computeSuggestedBuilds, computeCascadeBuilds, higherTierIds } from "./domain/relations";
import { deriveParamValues, mergeParamValueSources } from "./domain/paramRegistry";

import {
    loadPersistedState,
    saveBuilds,
    saveItemIcons,
    saveCustomParamValues,
    saveSources,
    saveImportCache,
    exportSnapshot as writeSnapshotFile,
    importSnapshotFile,
    type SourceUrls,
} from "./persistence/localStore";

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

    builds: Build[] = [];

    itemIcons: Record<string, string> = {};

    customParamValues: Record<string, string[]> = {};

    sources: SourceUrls = { configUrl: "", translationsUrl: "" };

    importReport: ImportReport | null = null;

    importError: string | null = null;

    importing = false;

    importedAt: string | null = null;

    /** Bumped on every mutation; read by useStore() via useSyncExternalStore. */
    version = 0;

    readonly itemService = new ItemService();

    readonly buildService = new BuildService();

    readonly importService = new ImportService();

    private listeners = new Set<() => void>();

    constructor() {
        const persisted = loadPersistedState();
        this.builds = persisted.builds;
        this.itemIcons = persisted.itemIcons;
        this.customParamValues = persisted.customParamValues;
        this.sources = persisted.sources;
        this.importedAt = persisted.importCacheTimestamp;

        if (persisted.importCache) {
            this.allItems = persisted.importCache.items;
            this.translations = persisted.importCache.translations;
            this.mechanics = persisted.importCache.mechanics;
            this.upgradeChains = persisted.importCache.upgradeChains ?? [];
            this.replaceRules = persisted.importCache.replaceRules ?? [];
            this.enumValues = persisted.importCache.enumValues ?? {};
        }
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

    /** Config items without a matching translation are treated as unfinished/removed content — hidden everywhere. */
    get items(): Item[] {
        return this.allItems.filter((item) => this.hasTranslation(item));
    }

    private hasTranslation(item: Item): boolean {
        return this.translations.some((translation) => translation.key === item.nameKey);
    }

    getItem(id: string): Item | undefined {
        return this.items.find((item) => item.id === id);
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
        return this.translations.find((translation) => translation.key === key)?.value;
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
        saveSources(sources);
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
        saveBuilds(this.builds);
        this.notify();
        return build;
    }

    upsertBuild(build: Build): void {
        const exists = this.builds.some((entry) => entry.id === build.id);
        this.builds = exists
            ? this.builds.map((entry) => (entry.id === build.id ? build : entry))
            : [...this.builds, build];
        saveBuilds(this.builds);
        this.notify();
    }

    deleteBuild(id: string): void {
        this.builds = this.builds.filter((build) => build.id !== id);
        saveBuilds(this.builds);
        this.notify();
    }

    /** Deletes every build still marked "Черновик" (auto: true, never edited/saved by the user). Returns how many were removed. */
    deleteAllDrafts(): number {
        const remaining = this.builds.filter((build) => !build.auto);
        const removed = this.builds.length - remaining.length;
        this.builds = remaining;
        saveBuilds(this.builds);
        this.notify();
        return removed;
    }

    addItemToBuild(buildId: string, itemId: string): void {
        this.builds = this.builds.map((build) =>
            build.id === buildId && !build.items.includes(itemId)
                ? { ...build, items: [...build.items, itemId] }
                : build
        );
        saveBuilds(this.builds);
        this.notify();
    }

    removeItemFromBuild(buildId: string, itemId: string): void {
        this.builds = this.builds.map((build) =>
            build.id === buildId ? { ...build, items: build.items.filter((id) => id !== itemId) } : build
        );
        saveBuilds(this.builds);
        this.notify();
    }

    /** Manual build<->build link, kept symmetric on both sides. */
    linkBuilds(buildIdA: string, buildIdB: string): void {
        if (buildIdA === buildIdB) return;
        this.builds = this.builds.map((build) => {
            const otherId = build.id === buildIdA ? buildIdB : build.id === buildIdB ? buildIdA : null;
            if (!otherId || (build.manualLinks ?? []).includes(otherId)) return build;
            return { ...build, manualLinks: [...(build.manualLinks ?? []), otherId] };
        });
        saveBuilds(this.builds);
        this.notify();
    }

    unlinkBuilds(buildIdA: string, buildIdB: string): void {
        this.builds = this.builds.map((build) => {
            const otherId = build.id === buildIdA ? buildIdB : build.id === buildIdB ? buildIdA : null;
            if (!otherId) return build;
            return { ...build, manualLinks: (build.manualLinks ?? []).filter((id) => id !== otherId) };
        });
        saveBuilds(this.builds);
        this.notify();
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
        saveBuilds(this.builds);
        this.notify();
        return drafts.length;
    }

    /** Runs the PlayerScore-cascade pass (Activator/Bonus/spawn chains, not tag-clustering) and appends new draft builds. */
    suggestCascadeBuilds(includeUpgradeTiers = false): number {
        const { items, mechanics } = this.itemsForBuildGeneration(includeUpgradeTiers);
        const drafts = computeCascadeBuilds(
            items,
            mechanics,
            this.replaceRules,
            this.builds,
            (item) => this.itemName(item),
            (item) => this.getItemIcon(item.id)
        );
        this.builds = [...this.builds, ...drafts];
        saveBuilds(this.builds);
        this.notify();
        return drafts.length;
    }

    setItemIcon(itemId: string, icon: string): void {
        this.itemIcons = { ...this.itemIcons, [itemId]: icon };
        saveItemIcons(this.itemIcons);
        this.notify();
    }

    addCustomParamValue(dimension: string, value: string): void {
        const trimmed = value.trim();
        if (!trimmed) return;
        const existing = this.customParamValues[dimension] ?? [];
        if (existing.includes(trimmed)) return;
        this.customParamValues = { ...this.customParamValues, [dimension]: [...existing, trimmed] };
        saveCustomParamValues(this.customParamValues);
        this.notify();
    }

    exportSnapshot(): void {
        writeSnapshotFile({
            builds: this.builds,
            itemIcons: this.itemIcons,
            customParamValues: this.customParamValues,
            sources: this.sources,
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

    async importSnapshot(file: File): Promise<void> {
        const state = await importSnapshotFile(file);

        this.builds = state.builds;
        this.itemIcons = state.itemIcons;
        this.customParamValues = state.customParamValues;
        this.sources = state.sources;
        this.importedAt = state.importCacheTimestamp;

        if (state.importCache) {
            this.allItems = state.importCache.items;
            this.translations = state.importCache.translations;
            this.mechanics = state.importCache.mechanics;
            this.upgradeChains = state.importCache.upgradeChains ?? [];
            this.replaceRules = state.importCache.replaceRules ?? [];
            this.enumValues = state.importCache.enumValues ?? {};
        }

        this.notify();
    }

}
