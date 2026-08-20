/** Editor-only preferences for authoring content — not balance data, never exported to the sheet. */
export interface ContentSettings {
    /** Apply ID_RULES when creating an entity. On by default: the rules encode the config's own conventions. */
    validateIdsOnCreate: boolean;
}

export const DEFAULT_CONTENT_SETTINGS: ContentSettings = {
    validateIdsOnCreate: true,
};

export interface IdRule {
    /** Shown in Настройки so the rules are visible rather than hidden in code. */
    description: string;

    /** Returns the corrected id, or the same string when the rule doesn't apply. */
    apply: (id: string, itemType: string) => string;
}

/**
 * Conventions the real config follows, applied when creating something. Kept as a list so more can be added
 * without touching the call sites — the settings page renders whatever is here.
 */
export const ID_RULES: IdRule[] = [
    {
        description:
            "Card: если id не заканчивается на «_» и число — дописать «_1». " +
            "Карты почти всегда живут в цепочке прокачки, а её тиры нумеруются _1/_2/_3.",
        apply: (id, itemType) => (itemType === "Card" && !/_\d+$/.test(id) ? `${id}_1` : id),
    },
];

/** Runs every rule in order. Returns the final id plus which rules actually changed it. */
export function applyIdRules(
    id: string,
    itemType: string,
    enabled: boolean
): { id: string; applied: IdRule[] } {
    const trimmed = id.trim();
    if (!enabled || !trimmed) return { id: trimmed, applied: [] };

    const applied: IdRule[] = [];
    let result = trimmed;
    for (const rule of ID_RULES) {
        const next = rule.apply(result, itemType);
        if (next !== result) applied.push(rule);
        result = next;
    }

    return { id: result, applied };
}
