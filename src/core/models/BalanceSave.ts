import type { Item } from "./Item";
import type { Translation } from "./Translation";
import type { MechanicRow } from "./Mechanic";
import type { UpgradeChain } from "./UpgradeChain";
import type { Round } from "./Round";
import type { Deck } from "./Deck";
import type { Pack } from "./Pack";
import type { ReplaceRule } from "./ReplaceRule";
import type { Build } from "./Build";
import type { GlossaryEntry } from "./GlossaryEntry";
import type { TagIcon } from "./TagIcon";
import type { DescriptionSettings } from "../domain/descriptionTemplate";

/**
 * Metadata for a named balance save — the only thing the saves list ever shows (see SavesPage). The actual
 * content (BalanceSavePayload) is fetched from the `parts` subcollection only when actually restoring, never
 * subscribed to as part of the list, so the list stays cheap regardless of how many saves accumulate.
 */
export interface BalanceSaveMeta {
    id: string;

    name: string;

    description: string;

    createdAt: string;
}

/**
 * A full point-in-time capture of everything that makes up "the balance" — the imported config/translations
 * (items/mechanics/upgradeChains/replaceRules/enumValues/translations, otherwise only ever kept per-browser in
 * localStorage, see localStore.ts) plus every shared Firestore-curated piece (builds, icons, glossary, ...).
 * Deliberately excludes `sources` (the Google Sheets/Apps Script URLs) — restoring a balance shouldn't repoint
 * where config is downloaded from, that's a connection setting, not balance content.
 */
export interface BalanceSavePayload {
    items: Item[];

    translations: Translation[];

    mechanics: MechanicRow[];

    upgradeChains: UpgradeChain[];

    rounds: Round[];

    decks: Deck[];

    packs: Pack[];

    replaceRules: ReplaceRule[];

    enumValues: Record<string, string[]>;

    builds: Build[];

    itemIcons: Record<string, string>;

    customParamValues: Record<string, string[]>;

    descriptionSettings: DescriptionSettings;

    translationOverrides: Record<string, string>;

    exportedOverrides: Record<string, string>;

    glossary: GlossaryEntry[];

    tagIcons: TagIcon[];
}

/** Keys of BalanceSavePayload — each one is written/read as its own `parts/{key}` doc, see firestoreStore.ts. */
export const BALANCE_SAVE_PAYLOAD_KEYS: (keyof BalanceSavePayload)[] = [
    "items",
    "translations",
    "mechanics",
    "upgradeChains",
    "rounds",
    "decks",
    "packs",
    "replaceRules",
    "enumValues",
    "builds",
    "itemIcons",
    "customParamValues",
    "descriptionSettings",
    "translationOverrides",
    "exportedOverrides",
    "glossary",
    "tagIcons",
];
