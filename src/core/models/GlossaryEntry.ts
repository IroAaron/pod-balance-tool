/**
 * A manually-curated "phrase in an item description -> icon/emoji" mapping, used by the "Иконки + Эмоджи"
 * description mode (see descriptionTemplate.ts's applyGlossary) to replace recognized phrases with a pictogram.
 * Matching is against the actual translated description text, not raw mechanic field values — see project memory
 * for why (real descriptions are free-form prose; mechanic modification tokens like "удалить" never appear in it
 * as substrings).
 */
export interface GlossaryEntry {
    id: string;

    /** One or more phrases, each matched case-insensitively as a substring against item description text — lets
     *  a single entry (one icon/emoji) cover every wording variant instead of needing a separate record each. */
    phrases: string[];

    /** Relative path under public/ (e.g. "roulette_interface/icons-tags/foo.svg") — wins over emoji when both are set. */
    icon?: string;

    /** Free-typed emoji/text, used when icon is unset. */
    emoji?: string;

    /** Free-form organizational note (e.g. "MechAddItem / удалить") — never used for matching. */
    note?: string;

    /** Whether this entry is allowed to participate in glossary-driven description matching at all — see the
     *  "Текст + Включенные записи" (only enabled entries apply) vs "Все записи" (every entry applies regardless
     *  of this flag) description modes in descriptionTemplate.ts/SettingsPage.tsx. Absent/undefined means
     *  enabled, so entries written before this field existed keep matching unchanged. */
    enabled?: boolean;
}

/** A raw object as it might come back from Firestore — either today's shape, or the legacy single-`phrase`
 *  shape from before entries supported multiple phrases. Only used at the read boundary (subscribeGlossary). */
type RawGlossaryEntry = Partial<GlossaryEntry> & { phrase?: string };

export function normalizeGlossaryEntry(raw: RawGlossaryEntry): GlossaryEntry {
    const phrases = Array.isArray(raw.phrases) ? raw.phrases : raw.phrase ? [raw.phrase] : [];
    return {
        id: raw.id ?? "",
        phrases,
        icon: raw.icon,
        emoji: raw.emoji,
        note: raw.note,
        enabled: raw.enabled,
    };
}
