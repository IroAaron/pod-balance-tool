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
import type { TagIcon } from "../models/TagIcon";
import { DEFAULT_BALANCE_CONFIG, type BalanceConfig } from "../models/BalanceConfig";
import type { SourceUrls } from "./localStore";
import { DEFAULT_DESCRIPTION_SETTINGS, type DescriptionSettings } from "../domain/descriptionTemplate";
import { DEFAULT_CONTENT_SETTINGS, type ContentSettings } from "../domain/idRules";
import { db } from "./firebaseClient";
import {
    BALANCE_SAVE_PAYLOAD_KEYS,
    type BalanceSaveMeta,
    type BalanceSavePayload,
} from "../models/BalanceSave";

const buildsCol = collection(db, "builds");
const sharedCol = collection(db, "shared");
const balanceSavesCol = collection(db, "balanceSaves");

export interface SharedState {
    itemIcons: Record<string, string>;

    customParamValues: Record<string, string[]>;

    sources: SourceUrls;

    descriptionSettings: DescriptionSettings;

    /** User-edited name/description text, keyed by translation key — see GameStore.getTranslation(). */
    translationOverrides: Record<string, string>;

    /** Snapshot of translationOverrides as of the last successful Sheets export — see GameStore.pendingExportCount. */
    exportedOverrides: Record<string, string>;

    /** Depth coefficients + balance constants — see BalancePage's "Константы" tab and domain/balance.ts. */
    balanceConfig: BalanceConfig;

    /** Site-only display names for decks/ball decks (any of Decks/DecksShop/BallGroups), keyed by deck id — pure
     *  editing convenience, NEVER exported to Google Sheets. Point-updated like itemIcons so it survives a config
     *  re-import (a fresh Decks/BallGroups download fully replaces those arrays, but this side-map is untouched). */
    deckNames: Record<string, string>;

    /** Editor-only authoring preferences (id rules) — NEVER exported to Google Sheets. */
    contentSettings: ContentSettings;

    /** Site-only "how many stage columns to show" override per Sprint id — NEVER exported (there's no MaxStages
     *  column in the real sheet). GameStore.getSprintStageCount takes the max of this and every real Stage value
     *  present, so real data is never hidden even if this override is stale. Point-updated like deckNames. */
    sprintStageCounts: Record<string, number>;
}

const DEFAULT_SHARED: SharedState = {
    itemIcons: {},
    customParamValues: {},
    sources: { configUrl: "", translationsUrl: "" },
    descriptionSettings: DEFAULT_DESCRIPTION_SETTINGS,
    translationOverrides: {},
    exportedOverrides: {},
    balanceConfig: DEFAULT_BALANCE_CONFIG,
    contentSettings: DEFAULT_CONTENT_SETTINGS,
    deckNames: {},
    sprintStageCounts: {},
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

/** Every independent `shared/*` doc subscribeShared combines — used to track which ones have delivered their
 *  first snapshot yet, see `ready` below. */
const SHARED_DOC_KEYS = [
    "itemIcons",
    "customParamValues",
    "sources",
    "descriptionSettings",
    "translationOverrides",
    "exportedOverrides",
    "balanceConfig",
    "contentSettings",
    "deckNames",
    "sprintStageCounts",
] as const;

/**
 * Combines 10 independent `shared/*` doc subscriptions into one callback — fires on every underlying snapshot (so
 * a live edit to any one field, e.g. from another collaborator, updates immediately), plus a `ready` flag that
 * only turns true once EVERY one of the 10 has delivered at least one snapshot.
 *
 * `ready` matters because callers gate a one-time "seed local form state from the store" remount on it (see
 * GameStore.sharedReady, consumed by ConstantsTab/SettingsPage's `key={store.sharedReady ? ... : ...}` pattern) —
 * **before this fix**, GameStore set `sharedReady = true` on the very first of these 10 listeners to fire, not all
 * of them, so a gated form could remount and seed itself from a field (e.g. `balanceConfig`) that hadn't actually
 * loaded yet, silently showing/committing stale defaults over real data. Found while verifying that restoring a
 * BalanceSave correctly repopulates `balanceConfig` — Firestore itself always had the right value, but a fresh
 * page load could still show the default depending on which doc's snapshot happened to arrive first.
 */
export function subscribeShared(onChange: (shared: SharedState, ready: boolean) => void): () => void {
    const state: SharedState = { ...DEFAULT_SHARED };
    const pendingKeys = new Set<(typeof SHARED_DOC_KEYS)[number]>(SHARED_DOC_KEYS);
    const emit = (key: (typeof SHARED_DOC_KEYS)[number]) => {
        pendingKeys.delete(key);
        onChange({ ...state }, pendingKeys.size === 0);
    };

    const unsubIcons = onSnapshot(
        doc(sharedCol, "itemIcons"),
        (snapshot) => {
            state.itemIcons = (snapshot.data() as Record<string, string> | undefined) ?? {};
            emit("itemIcons");
        },
        (error) => console.error("subscribeShared:itemIcons", error)
    );

    const unsubParamValues = onSnapshot(
        doc(sharedCol, "customParamValues"),
        (snapshot) => {
            state.customParamValues = (snapshot.data() as Record<string, string[]> | undefined) ?? {};
            emit("customParamValues");
        },
        (error) => console.error("subscribeShared:customParamValues", error)
    );

    const unsubSources = onSnapshot(
        doc(sharedCol, "sources"),
        (snapshot) => {
            state.sources = (snapshot.data() as SourceUrls | undefined) ?? DEFAULT_SHARED.sources;
            emit("sources");
        },
        (error) => console.error("subscribeShared:sources", error)
    );

    const unsubDescriptionSettings = onSnapshot(
        doc(sharedCol, "descriptionSettings"),
        (snapshot) => {
            // Merged over the defaults (not a raw cast) so a doc written before a field existed/was renamed
            // (e.g. the old spriteScale -> spriteWidthPx rename) falls back sanely for just that field instead
            // of silently reading as `undefined` until the next full commit from the Settings page.
            state.descriptionSettings = {
                ...DEFAULT_SHARED.descriptionSettings,
                ...(snapshot.data() as Partial<DescriptionSettings> | undefined),
            };
            emit("descriptionSettings");
        },
        (error) => console.error("subscribeShared:descriptionSettings", error)
    );

    const unsubTranslationOverrides = onSnapshot(
        doc(sharedCol, "translationOverrides"),
        (snapshot) => {
            state.translationOverrides = (snapshot.data() as Record<string, string> | undefined) ?? {};
            emit("translationOverrides");
        },
        (error) => console.error("subscribeShared:translationOverrides", error)
    );

    const unsubExportedOverrides = onSnapshot(
        doc(sharedCol, "exportedOverrides"),
        (snapshot) => {
            state.exportedOverrides = (snapshot.data() as Record<string, string> | undefined) ?? {};
            emit("exportedOverrides");
        },
        (error) => console.error("subscribeShared:exportedOverrides", error)
    );

    const unsubBalanceConfig = onSnapshot(
        doc(sharedCol, "balanceConfig"),
        (snapshot) => {
            // Merged over the default (not a raw cast), same reasoning as descriptionSettings above — a doc
            // written before a new depth row existed shouldn't leave that depth's coefficient undefined.
            const data = snapshot.data() as Partial<BalanceConfig> | undefined;
            state.balanceConfig = {
                ...DEFAULT_SHARED.balanceConfig,
                ...data,
                depthCoefficients: {
                    ...DEFAULT_SHARED.balanceConfig.depthCoefficients,
                    ...data?.depthCoefficients,
                },
            };
            emit("balanceConfig");
        },
        (error) => console.error("subscribeShared:balanceConfig", error)
    );

    const unsubContentSettings = onSnapshot(
        doc(sharedCol, "contentSettings"),
        (snapshot) => {
            // Merged over the default so a doc written before a new preference existed doesn't leave it undefined.
            state.contentSettings = {
                ...DEFAULT_SHARED.contentSettings,
                ...(snapshot.data() as Partial<ContentSettings> | undefined),
            };
            emit("contentSettings");
        },
        (error) => console.error("subscribeShared:contentSettings", error)
    );

    const unsubDeckNames = onSnapshot(
        doc(sharedCol, "deckNames"),
        (snapshot) => {
            state.deckNames = (snapshot.data() as Record<string, string> | undefined) ?? {};
            emit("deckNames");
        },
        (error) => console.error("subscribeShared:deckNames", error)
    );

    const unsubSprintStageCounts = onSnapshot(
        doc(sharedCol, "sprintStageCounts"),
        (snapshot) => {
            state.sprintStageCounts = (snapshot.data() as Record<string, number> | undefined) ?? {};
            emit("sprintStageCounts");
        },
        (error) => console.error("subscribeShared:sprintStageCounts", error)
    );

    return () => {
        unsubIcons();
        unsubParamValues();
        unsubSources();
        unsubDescriptionSettings();
        unsubTranslationOverrides();
        unsubExportedOverrides();
        unsubBalanceConfig();
        unsubContentSettings();
        unsubDeckNames();
        unsubSprintStageCounts();
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

/** Same independent-doc/full-overwrite pattern as the glossary — a small, hand-curated tag→icon list. */
export function subscribeTagIcons(onChange: (entries: TagIcon[]) => void): () => void {
    return onSnapshot(
        doc(sharedCol, "tagIcons"),
        (snapshot) => onChange((snapshot.data()?.entries as TagIcon[] | undefined) ?? []),
        (error) => console.error("subscribeTagIcons", error)
    );
}

export function replaceTagIconsRemote(entries: TagIcon[]): Promise<void> {
    return setDoc(doc(sharedCol, "tagIcons"), { entries: stripUndefined(entries) });
}

/** Same independent-doc/full-overwrite pattern as tagIcons — the curated list of "Спец. раунд" values shown in
 *  RoundDetailPage's rules Autocomplete, user-managed via SpecialRoundTypesPopover. Starts empty (no pre-seeding). */
export function subscribeSpecialRoundTypes(onChange: (values: string[]) => void): () => void {
    return onSnapshot(
        doc(sharedCol, "specialRoundTypes"),
        (snapshot) => onChange((snapshot.data()?.entries as string[] | undefined) ?? []),
        (error) => console.error("subscribeSpecialRoundTypes", error)
    );
}

export function replaceSpecialRoundTypesRemote(values: string[]): Promise<void> {
    return setDoc(doc(sharedCol, "specialRoundTypes"), { entries: values });
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

/** Site-only deck display name — see SharedState.deckNames's doc. Passing "" deletes the field, same convention
 *  as updateTranslationOverrideRemote. */
export function updateDeckNameRemote(deckId: string, name: string): Promise<void> {
    return upsertDocField(doc(sharedCol, "deckNames"), deckId, name || deleteField());
}

/** Site-only sprint stage-count override — see SharedState.sprintStageCounts's doc. */
export function updateSprintStageCountRemote(sprintId: string, count: number): Promise<void> {
    return upsertDocField(doc(sharedCol, "sprintStageCounts"), sprintId, count);
}

export function addCustomParamValueRemote(dimension: string, value: string): Promise<void> {
    return upsertDocField(doc(sharedCol, "customParamValues"), dimension, arrayUnion(value));
}

/** Point-updates just this one field of shared/sources — NOT a full-document setDoc, deliberately. importConfig
 *  and importTranslations each only ever touch their own URL; a whole-object setDoc using this store's locally
 *  cached `sources` would silently clobber the *other* field back to whatever stale value was last loaded here
 *  (e.g. still "" if the initial Firestore snapshot hadn't arrived yet when the button was clicked) — this is
 *  exactly what happened in production: translationsUrl got wiped to "" by an importConfig call that raced the
 *  initial subscribeShared snapshot, even though nobody ever touched the translations field. */
export function updateSourceConfigUrlRemote(configUrl: string): Promise<void> {
    return upsertDocField(doc(sharedCol, "sources"), "configUrl", configUrl);
}

export function updateSourceTranslationsUrlRemote(translationsUrl: string): Promise<void> {
    return upsertDocField(doc(sharedCol, "sources"), "translationsUrl", translationsUrl);
}

export function updateDescriptionSettingsRemote(settings: DescriptionSettings): Promise<void> {
    return setDoc(doc(sharedCol, "descriptionSettings"), settings);
}

export function updateContentSettingsRemote(settings: ContentSettings): Promise<void> {
    return setDoc(doc(sharedCol, "contentSettings"), settings);
}

export function updateBalanceConfigRemote(config: BalanceConfig): Promise<void> {
    return setDoc(doc(sharedCol, "balanceConfig"), config);
}

/** Passing "" deletes the field entirely rather than storing an empty string, so a cleared override doesn't
 *  linger as clutter in the doc — getTranslation() would treat either the same way, but this keeps the data clean. */
export function updateTranslationOverrideRemote(key: string, value: string): Promise<void> {
    return upsertDocField(doc(sharedCol, "translationOverrides"), key, value || deleteField());
}

/** Full overwrite — written once per successful export with every key/value just sent, not point-updated per
 *  key, since a single export touches many keys at once anyway (see GameStore.exportEditedTranslations). */
export function replaceExportedOverridesRemote(overrides: Record<string, string>): Promise<void> {
    return setDoc(doc(sharedCol, "exportedOverrides"), overrides);
}

/** Full overwrite, for the same reason as replaceExportedOverridesRemote: a translations import can retire many
 *  overrides at once (see GameStore.dropOverridesSupersededByImport), and point-updating each would be dozens
 *  of round-trips for one logical change. */
export function replaceTranslationOverridesRemote(overrides: Record<string, string>): Promise<void> {
    return setDoc(doc(sharedCol, "translationOverrides"), overrides);
}

/** Full overwrite of all `shared/*` docs — used by importSnapshot, which is a full-replace operation. */
export function replaceSharedState(shared: SharedState): Promise<void> {
    const batch = writeBatch(db);
    batch.set(doc(sharedCol, "itemIcons"), shared.itemIcons);
    batch.set(doc(sharedCol, "customParamValues"), shared.customParamValues);
    batch.set(doc(sharedCol, "sources"), shared.sources);
    batch.set(doc(sharedCol, "descriptionSettings"), shared.descriptionSettings);
    batch.set(doc(sharedCol, "translationOverrides"), shared.translationOverrides);
    batch.set(doc(sharedCol, "exportedOverrides"), shared.exportedOverrides);
    batch.set(doc(sharedCol, "balanceConfig"), shared.balanceConfig);
    batch.set(doc(sharedCol, "contentSettings"), shared.contentSettings);
    batch.set(doc(sharedCol, "deckNames"), shared.deckNames);
    batch.set(doc(sharedCol, "sprintStageCounts"), shared.sprintStageCounts);
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

/**
 * Named balance saves live under `balanceSaves/{id}` (metadata only: name/description/createdAt) with the actual
 * captured state split one-key-per-doc into a `parts` subcollection (`balanceSaves/{id}/parts/{key}`) — same
 * per-field-doc pattern as `shared/*` above, needed here because the full payload (items/mechanics/translations
 * included) can run well past Firestore's 1 MiB single-document limit if kept as one doc, while any single table
 * on its own stays comfortably under it.
 */
function partsCol(saveId: string) {
    return collection(db, "balanceSaves", saveId, "parts");
}

/** Metadata-only list — never touches `parts`, so this stays cheap no matter how large individual saves are. */
export function subscribeBalanceSaves(onChange: (saves: BalanceSaveMeta[]) => void): () => void {
    return onSnapshot(
        balanceSavesCol,
        (snapshot) =>
            onChange(
                snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<BalanceSaveMeta, "id">) }))
            ),
        (error) => console.error("subscribeBalanceSaves", error)
    );
}

export async function createBalanceSaveRemote(
    name: string,
    description: string,
    payload: BalanceSavePayload
): Promise<BalanceSaveMeta> {
    const id = `save-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const meta: BalanceSaveMeta = { id, name, description, createdAt: new Date().toISOString() };

    const batch = writeBatch(db);
    batch.set(doc(balanceSavesCol, id), { name, description, createdAt: meta.createdAt });
    for (const key of BALANCE_SAVE_PAYLOAD_KEYS) {
        batch.set(doc(partsCol(id), key), { value: stripUndefined(payload[key]) });
    }
    await batch.commit();

    return meta;
}

/** Reconstructs the full payload from its `parts` subcollection — only called on demand (restoring), never subscribed. */
export async function fetchBalanceSavePayloadRemote(saveId: string): Promise<BalanceSavePayload> {
    const snapshot = await getDocs(partsCol(saveId));
    const byKey = new Map(snapshot.docs.map((entry) => [entry.id, entry.data().value]));

    return {
        items: (byKey.get("items") as BalanceSavePayload["items"]) ?? [],
        translations: (byKey.get("translations") as BalanceSavePayload["translations"]) ?? [],
        mechanics: (byKey.get("mechanics") as BalanceSavePayload["mechanics"]) ?? [],
        upgradeChains: (byKey.get("upgradeChains") as BalanceSavePayload["upgradeChains"]) ?? [],
        rounds: (byKey.get("rounds") as BalanceSavePayload["rounds"]) ?? [],
        decks: (byKey.get("decks") as BalanceSavePayload["decks"]) ?? [],
        packs: (byKey.get("packs") as BalanceSavePayload["packs"]) ?? [],
        balls: (byKey.get("balls") as BalanceSavePayload["balls"]) ?? [],
        ballGroups: (byKey.get("ballGroups") as BalanceSavePayload["ballGroups"]) ?? [],
        sprints: (byKey.get("sprints") as BalanceSavePayload["sprints"]) ?? [],
        shops: (byKey.get("shops") as BalanceSavePayload["shops"]) ?? [],
        replaceRules: (byKey.get("replaceRules") as BalanceSavePayload["replaceRules"]) ?? [],
        enumValues: (byKey.get("enumValues") as BalanceSavePayload["enumValues"]) ?? {},
        builds: (byKey.get("builds") as BalanceSavePayload["builds"]) ?? [],
        itemIcons: (byKey.get("itemIcons") as BalanceSavePayload["itemIcons"]) ?? {},
        customParamValues: (byKey.get("customParamValues") as BalanceSavePayload["customParamValues"]) ?? {},
        descriptionSettings:
            (byKey.get("descriptionSettings") as BalanceSavePayload["descriptionSettings"]) ??
            DEFAULT_DESCRIPTION_SETTINGS,
        balanceConfig: (byKey.get("balanceConfig") as BalanceSavePayload["balanceConfig"]) ?? DEFAULT_BALANCE_CONFIG,
        translationOverrides: (byKey.get("translationOverrides") as BalanceSavePayload["translationOverrides"]) ?? {},
        exportedOverrides: (byKey.get("exportedOverrides") as BalanceSavePayload["exportedOverrides"]) ?? {},
        glossary: (byKey.get("glossary") as BalanceSavePayload["glossary"])?.map(normalizeGlossaryEntry) ?? [],
        tagIcons: (byKey.get("tagIcons") as BalanceSavePayload["tagIcons"]) ?? [],
        specialRoundTypes: (byKey.get("specialRoundTypes") as BalanceSavePayload["specialRoundTypes"]) ?? [],
        deckNames: (byKey.get("deckNames") as BalanceSavePayload["deckNames"]) ?? {},
        sprintStageCounts: (byKey.get("sprintStageCounts") as BalanceSavePayload["sprintStageCounts"]) ?? {},
    };
}

/** Deletes a save's metadata doc and every doc in its `parts` subcollection — Firestore never cascade-deletes subcollections on its own. */
export async function deleteBalanceSaveRemote(saveId: string): Promise<void> {
    const parts = await getDocs(partsCol(saveId));
    const batch = writeBatch(db);
    parts.docs.forEach((entry) => batch.delete(entry.ref));
    batch.delete(doc(balanceSavesCol, saveId));
    await batch.commit();
}
