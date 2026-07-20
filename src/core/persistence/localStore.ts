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

/** The imported game config is the only thing still kept in localStorage — builds/itemIcons/customParamValues/sources live in Firestore now (see firestoreStore.ts), each browser re-fetches its own config from Google Sheets/CSV regardless. */
export function loadImportCache(): Pick<PersistedState, "importCache" | "importCacheTimestamp"> {
    return {
        importCache: readJson("importCache", DEFAULT_STATE.importCache),
        importCacheTimestamp: readJson("importCacheTimestamp", DEFAULT_STATE.importCacheTimestamp),
    };
}

export function saveImportCache(data: NormalizedData | null): void {
    writeJson("importCache", data);
    writeJson("importCacheTimestamp", data ? new Date().toISOString() : null);
}

/** Reads whatever pre-Firestore local state is still sitting in this browser (from before the Firestore migration), for the one-time migration banner on SourcesPage. */
export function readLegacyLocalState(): Pick<PersistedState, "builds" | "itemIcons" | "customParamValues" | "sources"> {
    return {
        builds: readJson("builds", DEFAULT_STATE.builds),
        itemIcons: readJson("itemIcons", DEFAULT_STATE.itemIcons),
        customParamValues: readJson("customParamValues", DEFAULT_STATE.customParamValues),
        sources: readJson("sources", DEFAULT_STATE.sources),
    };
}

export function isMigratedToFirestore(): boolean {
    return readJson("migratedToFirestore", false);
}

export function markMigratedToFirestore(): void {
    writeJson("migratedToFirestore", true);
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

/** Pure parse, no side effects — the caller decides where the parsed state gets written (Firestore, now). */
export async function parseSnapshotFile(file: File): Promise<PersistedState> {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<PersistedState>;

    return {
        builds: parsed.builds ?? [],
        itemIcons: parsed.itemIcons ?? {},
        customParamValues: parsed.customParamValues ?? {},
        sources: parsed.sources ?? DEFAULT_STATE.sources,
        importCache: parsed.importCache ?? null,
        importCacheTimestamp: parsed.importCacheTimestamp ?? null,
    };
}
