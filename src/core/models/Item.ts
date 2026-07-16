export interface Item {
    id: string;

    tags: string[];

    itemType?: string;

    icon?: string;

    nameKey?: string;

    descKey?: string;

    raw: Record<string, string>;
}
