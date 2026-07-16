import type { Build } from "../models/Build";
import type { NormalizedData } from "../import/normalize";

const NAMESPACE = "pod-balance-tool:v1";

export interface SourceUrls {
    configUrl: string;

    translationsUrl: string;
}

export interface PersistedState {
    builds: Build[];

    itemIcons: Record<string, string>;

    customParamValues: Record<string, string[]>;

    sources: SourceUrls;

    importCache: NormalizedData | null;

    importCacheTimestamp: string | null;
}

const DEFAULT_STATE: PersistedState = {
    builds: [],
    itemIcons: {},
    customParamValues: {},
    sources: { configUrl: "", translationsUrl: "" },
    importCache: null,
    importCacheTimestamp: null,
};

function storageKey(name: string): string {
    return `${NAMESPACE}:${name}`;
}

function readJson<T>(name: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(storageKey(name));
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function writeJson(name: string, value: unknown): void {
    localStorage.setItem(storageKey(name), JSON.stringify(value));
}

export function loadPersistedState(): PersistedState {
    return {
        builds: readJson("builds", DEFAULT_STATE.builds),
        itemIcons: readJson("itemIcons", DEFAULT_STATE.itemIcons),
        customParamValues: readJson("customParamValues", DEFAULT_STATE.customParamValues),
        sources: readJson("sources", DEFAULT_STATE.sources),
        importCache: readJson("importCache", DEFAULT_STATE.importCache),
        importCacheTimestamp: readJson("importCacheTimestamp", DEFAULT_STATE.importCacheTimestamp),
    };
}

export function saveBuilds(builds: Build[]): void {
    writeJson("builds", builds);
}

export function saveItemIcons(icons: Record<string, string>): void {
    writeJson("itemIcons", icons);
}

export function saveCustomParamValues(values: Record<string, string[]>): void {
    writeJson("customParamValues", values);
}

export function saveSources(sources: SourceUrls): void {
    writeJson("sources", sources);
}

export function saveImportCache(data: NormalizedData | null): void {
    writeJson("importCache", data);
    writeJson("importCacheTimestamp", data ? new Date().toISOString() : null);
}

export function exportSnapshot(state: PersistedState): void {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `pod-balance-tool-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    URL.revokeObjectURL(url);
}

export async function importSnapshotFile(file: File): Promise<PersistedState> {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<PersistedState>;

    const state: PersistedState = {
        builds: parsed.builds ?? [],
        itemIcons: parsed.itemIcons ?? {},
        customParamValues: parsed.customParamValues ?? {},
        sources: parsed.sources ?? DEFAULT_STATE.sources,
        importCache: parsed.importCache ?? null,
        importCacheTimestamp: parsed.importCacheTimestamp ?? null,
    };

    saveBuilds(state.builds);
    saveItemIcons(state.itemIcons);
    saveCustomParamValues(state.customParamValues);
    saveSources(state.sources);
    saveImportCache(state.importCache);

    return state;
}
