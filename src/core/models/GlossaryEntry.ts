/**
 * A manually-curated "phrase in an item description -> icon/emoji" mapping, used by the "Иконки + Эмоджи"
 * description mode (see descriptionTemplate.ts's applyGlossary) to replace recognized phrases with a pictogram.
 * Matching is against the actual translated description text, not raw mechanic field values — see project memory
 * for why (real descriptions are free-form prose; mechanic modification tokens like "удалить" never appear in it
 * as substrings).
 */
export interface GlossaryEntry {
    id: string;

    /** Matched case-insensitively as a substring against item description text. */
    phrase: string;

    /** Relative path under public/ (e.g. "icons-tags/foo.svg") — wins over emoji when both are set. */
    icon?: string;

    /** Free-typed emoji/text, used when icon is unset. */
    emoji?: string;

    /** Free-form organizational note (e.g. "MechAddItem / удалить") — never used for matching. */
    note?: string;
}
