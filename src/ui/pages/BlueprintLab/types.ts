import type { Node } from "@xyflow/react";
import type { BlockKind, MechanicKind } from "./mechanicSchema";

export type { MechanicKind, BlockKind };

export type ItemKind = "Card" | "House" | "Artefact";

export interface ItemNodeData extends Record<string, unknown> {
    name: string;
    itemType: ItemKind;
    tags: string[];
    onChange: (patch: Partial<Pick<ItemNodeData, "name" | "itemType" | "tags">>) => void;
    onAddMechanic: (kind: MechanicKind) => void;
}

export interface MechanicNodeData extends Record<string, unknown> {
    kind: MechanicKind;
    fields: Record<string, string>;
    onKindChange: (kind: MechanicKind) => void;
    onFieldChange: (field: string, value: string) => void;
}

export interface BlockNodeData extends Record<string, unknown> {
    blockKind: BlockKind;
    mechanicKind: MechanicKind;
    fields: Record<string, string>;
    onFieldChange: (field: string, value: string) => void;
}

export type ItemFlowNode = Node<ItemNodeData, "item">;
export type MechanicFlowNode = Node<MechanicNodeData, "mechanic">;
export type BlockFlowNode = Node<BlockNodeData, "block">;
