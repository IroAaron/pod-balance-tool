export interface Build {
    id: string;

    name: string;

    description?: string;

    icon?: string;

    color?: string;

    items: string[];

    notes?: string;

    auto?: boolean;

    /** Ids of other builds manually linked to this one (kept symmetric — see GameStore.linkBuilds). */
    manualLinks?: string[];
}
