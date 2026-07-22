import {
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    deleteField,
    doc,
    type DocumentReference,
    FieldPath,
    getDocs,
    onSnapshot,
    setDoc,
    updateDoc,
    writeBatch,
} from "firebase/firestore";

import type { Build } from "../models/Build";
import { normalizeGlossaryEntry, type GlossaryEntry } from "../models/GlossaryEntry";
import type { SourceUrls } from "./localStore";
import { DEFAULT_DESCRIPTION_SETTINGS, type DescriptionSettings } from "../domain/descriptionTemplate";
import { db } from "./firebaseClient";

const buildsCol = collection(db, "builds");
const sharedCol = collection(db, "shared");

export interface SharedState {
    itemIcons: Record<string, string>;

    customParamValues: Record<string, string[]>;

    sources: SourceUrls;

    descriptionSettings: DescriptionSettings;

    /** User-edited name/description text, keyed by translation key — see GameStore.getTranslation(). */
    translationOverrides: Record<string, string>;
}

const DEFAULT_SHARED: SharedState = {
    itemIcons: {},
    customParamValues: {},
    sources: { configUrl: "", translationsUrl: "" },
    descriptionSettings: DEFAULT_DESCRIPTION_SETTINGS,
    translationOverrides: {},
};

export interface LegacyLocalState {
    builds: Build[];

    itemIcons: Record<string, string>;

    customParamValues: Record<string, string[]>;

    sources: SourceUrls;
}

export function subscribeBuilds(onChange: (builds: Build[]) => void): () => void {
    return onSnapshot(
        buildsCol,
        (snapshot) => onChange(snapshot.docs.map((entry) => entry.data() as Build)),
        (error) => console.error("subscribeBuilds", error)
    );
}

/** Combines the three `shared/*` docs into one callback — fires once per underlying doc snapshot. */
export function subscribeShared(onChange: (shared: SharedState) => void): () => void {
    const state: SharedState = { ...DEFAULT_SHARED };
    const emit = () => onChange({ ...state });

    const unsubIcons = onSnapshot(
        doc(sharedCol, "itemIcons"),
        (snapshot) => {
            state.itemIcons = (snapshot.data() as Record<string, string> | undefined) ?? {};
            emit();
        },
        (error) => console.error("subscribeShared:itemIcons", error)
    );

    const unsubParamValues = onSnapshot(
        doc(sharedCol, "customParamValues"),
        (snapshot) => {
            state.customParamValues = (snapshot.data() as Record<string, string[]> | undefined) ?? {};
            emit();
        },
        (error) => console.error("subscribeShared:customParamValues", error)
    );

    const unsubSources = onSnapshot(
        doc(sharedCol, "sources"),
        (snapshot) => {
            state.sources = (snapshot.data() as SourceUrls | undefined) ?? DEFAULT_SHARED.sources;
            emit();
        },
        (error) => console.error("subscribeShared:sources", error)
    );

    const unsubDescriptionSettings = onSnapshot(
        doc(sharedCol, "descriptionSettings"),
        (snapshot) => {
            state.descriptionSettings =
                (snapshot.data() as DescriptionSettings | undefined) ?? DEFAULT_SHARED.descriptionSettings;
            emit();
        },
        (error) => console.error("subscribeShared:descriptionSettings", error)
    );

    const unsubTranslationOverrides = onSnapshot(
        doc(sharedCol, "translationOverrides"),
        (snapshot) => {
            state.translationOverrides = (snapshot.data() as Record<string, string> | undefined) ?? {};
            emit();
        },
        (error) => console.error("subscribeShared:translationOverrides", error)
    );

    return () => {
        unsubIcons();
        unsubParamValues();
        unsubSources();
        unsubDescriptionSettings();
        unsubTranslationOverrides();
    };
}

/**
 * Its own independent subscription rather than folded into subscribeShared — that function already bundles 4
 * docs into one combined callback, and the glossary is edited/read from a dedicated page, not alongside the
 * other shared settings, so keeping it separate avoids growing that composite further.
 */
export function subscribeGlossary(onChange: (entries: GlossaryEntry[]) => void): () => void {
    return onSnapshot(
        doc(sharedCol, "glossary"),
        (snapshot) => {
            const raw = (snapshot.data()?.entries as Parameters<typeof normalizeGlossaryEntry>[0][] | undefined) ?? [];
            onChange(raw.map(normalizeGlossaryEntry));
        },
        (error) => console.error("subscribeGlossary", error)
    );
}

/** Firestore's setDoc rejects any object with a literal `undefined` property value (distinct from the key being
 *  absent entirely) — GlossaryPage's per-row editor always writes `icon: value || undefined` for whichever
 *  optional field the user leaves blank, so an entry that never had that key set gains one set to `undefined`
 *  the moment any field on its row is blurred. Stripping here, right before the write, protects every caller of
 *  replaceGlossaryRemote regardless of how the patch was built upstream. */
function stripUndefined<T extends object>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/** Full overwrite, like updateSourcesRemote/updateDescriptionSettingsRemote — the glossary is small and
 *  hand-curated, so there's no need for the itemIcons-style per-key point-update dance. */
export function replaceGlossaryRemote(entries: GlossaryEntry[]): Promise<void> {
    return setDoc(doc(sharedCol, "glossary"), { entries: stripUndefined(entries) });
}

export function writeBuild(build: Build): Promise<void> {
    return setDoc(doc(buildsCol, build.id), build);
}

export function deleteBuildDoc(id: string): Promise<void> {
    return deleteDoc(doc(buildsCol, id));
}

export function writeBuildsBatch(builds: Build[]): Promise<void> {
    const batch = writeBatch(db);
    builds.forEach((build) => batch.set(doc(buildsCol, build.id), build));
    return batch.commit();
}

export function deleteBuildsBatch(ids: string[]): Promise<void> {
    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(buildsCol, id)));
    return batch.commit();
}

export function addItemToBuildRemote(buildId: string, itemId: string): Promise<void> {
    return updateDoc(doc(buildsCol, buildId), { items: arrayUnion(itemId) });
}

export function removeItemFromBuildRemote(buildId: string, itemId: string): Promise<void> {
    return updateDoc(doc(buildsCol, buildId), { items: arrayRemove(itemId) });
}

/** Manual build<->build link, written symmetrically on both docs in one atomic batch. */
export function linkBuildsRemote(buildIdA: string, buildIdB: string): Promise<void> {
    const batch = writeBatch(db);
    batch.update(doc(buildsCol, buildIdA), { manualLinks: arrayUnion(buildIdB) });
    batch.update(doc(buildsCol, buildIdB), { manualLinks: arrayUnion(buildIdA) });
    return batch.commit();
}

export function unlinkBuildsRemote(buildIdA: string, buildIdB: string): Promise<void> {
    const batch = writeBatch(db);
    batch.update(doc(buildsCol, buildIdA), { manualLinks: arrayRemove(buildIdB) });
    batch.update(doc(buildsCol, buildIdB), { manualLinks: arrayRemove(buildIdA) });
    return batch.commit();
}

/**
 * Point-updates a single field on a `shared/*` doc without touching the rest of it, so two people editing
 * different keys (different item icons / different param dimensions) never clobber each other. Falls back to
 * setDoc only the first time the doc doesn't exist yet — FieldPath sidesteps updateDoc's usual "dot in a
 * string key means nested path" parsing, which matters since itemId/dimension values aren't guaranteed dot-free.
 *
 * **This fallback never actually ran before** — the "not-found" check used `error instanceof FirestoreError`,
 * but the Firebase JS SDK actually throws a plain `FirebaseError` with a `.code` string (`FirestoreError` isn't
 * a real runtime class here, just a type). Every doc this function ever targeted (itemIcons, customParamValues)
 * happened to already exist from the initial Firestore migration, so the broken fallback path was never
 * exercised until `translationOverrides` — a genuinely new doc — hit it for the first time and errored instead
 * of creating the doc. Fixed by checking `.code` directly instead of `instanceof`.
 */
async function upsertDocField(ref: DocumentReference, field: string, value: unknown): Promise<void> {
    try {
        await updateDoc(ref, new FieldPath(field), value);
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "not-found") {
            await setDoc(ref, { [field]: value });
        } else {
            throw error;
        }
    }
}

export function updateItemIconRemote(itemId: string, icon: string): Promise<void> {
    return upsertDocField(doc(sharedCol, "itemIcons"), itemId, icon);
}

export function addCustomParamValueRemote(dimension: string, value: string): Promise<void> {
    return upsertDocField(doc(sharedCol, "customParamValues"), dimension, arrayUnion(value));
}

export function updateSourcesRemote(sources: SourceUrls): Promise<void> {
    return setDoc(doc(sharedCol, "sources"), sources);
}

export function updateDescriptionSettingsRemote(settings: DescriptionSettings): Promise<void> {
    return setDoc(doc(sharedCol, "descriptionSettings"), settings);
}

/** Passing "" deletes the field entirely rather than storing an empty string, so a cleared override doesn't
 *  linger as clutter in the doc — getTranslation() would treat either the same way, but this keeps the data clean. */
export function updateTranslationOverrideRemote(key: string, value: string): Promise<void> {
    return upsertDocField(doc(sharedCol, "translationOverrides"), key, value || deleteField());
}

/** Full overwrite of all `shared/*` docs — used by importSnapshot, which is a full-replace operation. */
export function replaceSharedState(shared: SharedState): Promise<void> {
    const batch = writeBatch(db);
    batch.set(doc(sharedCol, "itemIcons"), shared.itemIcons);
    batch.set(doc(sharedCol, "customParamValues"), shared.customParamValues);
    batch.set(doc(sharedCol, "sources"), shared.sources);
    batch.set(doc(sharedCol, "descriptionSettings"), shared.descriptionSettings);
    batch.set(doc(sharedCol, "translationOverrides"), shared.translationOverrides);
    return batch.commit();
}

/** One-time migration of a browser's local data into Firestore. No-ops if `builds` already has any docs. */
export async function migrateIfEmpty(local: LegacyLocalState): Promise<"migrated" | "skipped-not-empty"> {
    const existing = await getDocs(buildsCol);
    if (!existing.empty) return "skipped-not-empty";

    const batch = writeBatch(db);
    local.builds.forEach((build) => batch.set(doc(buildsCol, build.id), build));
    batch.set(doc(sharedCol, "itemIcons"), local.itemIcons);
    batch.set(doc(sharedCol, "customParamValues"), local.customParamValues);
    batch.set(doc(sharedCol, "sources"), local.sources);
    await batch.commit();
    return "migrated";
}

/** Full-replace write used by importSnapshot — deletes builds absent from the snapshot so it's a true replace, not a merge. */
export async function replaceAllBuilds(builds: Build[]): Promise<void> {
    const existing = await getDocs(buildsCol);
    const incomingIds = new Set(builds.map((build) => build.id));

    const batch = writeBatch(db);
    existing.docs.forEach((entry) => {
        if (!incomingIds.has(entry.id)) batch.delete(entry.ref);
    });
    builds.forEach((build) => batch.set(doc(buildsCol, build.id), build));
    await batch.commit();
}
