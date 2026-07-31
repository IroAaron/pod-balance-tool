import type { Node } from "@xyflow/react";
import type { BlockKind, MechanicKind } from "./mechanicSchema";

export type { MechanicKind, BlockKind };

export type ItemKind = "Card" | "House" | "Artefact";

export interface ItemNodeData extends Record<string, unknown> {
    /** Real game ItemId — user-typed for a brand-new draft, fixed once loaded via the "Load item" picker. */
    itemId: string;
    /** True once loaded via the picker — locks id/category editing so a typo can't fork a real item under a new id. */
    locked: boolean;
    /** Translation keys backing the Name/Description fields — read/written through the store, not local state. */
    nameKey: string;
    descKey: string;
    itemType: ItemKind;
    tags: string[];
    possibleColors: string[];
    /** Real per-category columns (see ITEM_CATEGORY_COLUMNS), minus Tags/PossibleColors/ItemId. */
    rawFields: Record<string, string>;
    onChange: (patch: Partial<Pick<ItemNodeData, "itemId" | "itemType" | "tags" | "possibleColors">>) => void;
    onRawFieldChange: (field: string, value: string) => void;
    onAddMechanic: (kind: MechanicKind) => void;
}

export interface MechanicNodeData extends Record<string, unknown> {
    kind: MechanicKind;
    fields: Record<string, string>;
    /** Real MechanicRow.id when loaded from an existing item, otherwise a synthetic "blueprint:<flowNodeId>" id. */
    rowId: string;
    /** True when loaded from a real, already-existing mechanic row — its edits sync locally but never export
     *  (see GameStore.updateMechanicRowFields's doc: MechanicRow.id isn't a stable real spreadsheet key). */
    existing: boolean;
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
