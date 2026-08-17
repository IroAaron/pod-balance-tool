export interface Ball {
    id: string;

    runMin?: number;

    runMax?: number;

    inertiaMin?: number;

    inertiaMax?: number;

    valueMin?: number;

    valueMax?: number;

    color?: string;

    /** Confirmed unused in real data — shown read-only, never edited or exported (same precedent as Pack.metaTag). */
    metaTag?: string;

    nameKey: string;

    descKey: string;
}
