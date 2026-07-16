import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { UpgradeChain } from "../models/UpgradeChain";

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

    /**
     * Item -> Build membership edges only, per spec (no item-item edges).
     * Upgrade tiers past the first are excluded from the graph — they're
     * power-scaled clones of the base item and just clutter the layout.
     */
    build(items: Item[], builds: Build[], upgradeChains: UpgradeChain[], resolveItemLabel: (item: Item) => string): GraphData {
        const higherTierIds = new Set(upgradeChains.flatMap((chain) => chain.itemIds.slice(1)));
        const graphItems = items.filter((item) => !higherTierIds.has(item.id));

        const nodes: GraphNode[] = [
            ...graphItems.map((item) => ({ id: item.id, kind: "item" as const, label: resolveItemLabel(item) })),
            ...builds.map((build) => ({ id: build.id, kind: "build" as const, label: build.name || "Без названия" })),
        ];

        const itemIds = new Set(graphItems.map((item) => item.id));

        const links: GraphLink[] = builds.flatMap((build) =>
            build.items.filter((itemId) => itemIds.has(itemId)).map((itemId) => ({ source: itemId, target: build.id }))
        );

        return { nodes, links };
    }

}
