export interface Build {
    id: string;

    name: string;

    description?: string;

    icon?: string;

    color?: string;

    items: string[];

    notes?: string;

    auto?: boolean;
}
