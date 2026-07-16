import type { Item } from "../models/Item";
import type { Build } from "../models/Build";

export interface GraphNode {
    id: string;

    kind: "item" | "build";

    label: string;
}

export interface GraphLink {
    source: string;

    target: string;
}

export interface GraphData {
    nodes: GraphNode[];

    links: GraphLink[];
}

export class GraphService {

    /** Item -> Build membership edges only, per spec (no item-item edges). */
    build(items: Item[], builds: Build[], resolveItemLabel: (item: Item) => string): GraphData {
        const nodes: GraphNode[] = [
            ...items.map((item) => ({ id: item.id, kind: "item" as const, label: resolveItemLabel(item) })),
            ...builds.map((build) => ({ id: build.id, kind: "build" as const, label: build.name || "Без названия" })),
        ];

        const itemIds = new Set(items.map((item) => item.id));

        const links: GraphLink[] = builds.flatMap((build) =>
            build.items.filter((itemId) => itemIds.has(itemId)).map((itemId) => ({ source: itemId, target: build.id }))
        );

        return { nodes, links };
    }

}
