import { useCallback, useEffect, useRef, useState } from "react";
import {
    Background,
    Controls,
    MiniMap,
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useEdgesState,
    useNodesState,
    useReactFlow,
    type Connection,
    type Edge,
    type FinalConnectionState,
    type IsValidConnection,
    type OnConnectStart,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";

import { useStore } from "../../hooks/useStore";
import type { MechanicRow } from "../../../core/models/Mechanic";
import ItemNode from "./ItemNode";
import MechanicNode from "./MechanicNode";
import BlockNode from "./BlockNode";
import ItemRefSelect from "./ItemRefSelect";
import PrimaryValueMenu from "./PrimaryValueMenu";
import EnumPanel from "./EnumPanel";
import { EnumRegistryProvider } from "./EnumRegistryContext";
import { ItemRegistryProvider } from "./ItemRegistryContext";
import { MECHANIC_BLOCKS, MECHANIC_MISC_FIELDS, blockLabel } from "./mechanicSchema";
import { ITEM_CATEGORY_COLUMNS } from "./itemSchema";
import type { BlockFlowNode, BlockKind, ItemFlowNode, ItemKind, MechanicFlowNode, MechanicKind } from "./types";

const nodeTypes = { item: ItemNode, mechanic: MechanicNode, block: BlockNode };

let idCounter = 0;
function nextId(prefix: string) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}

type FlowNode = ItemFlowNode | MechanicFlowNode | BlockFlowNode;

interface PendingBlockCreation {
    mechanicId: string;
    blockKind: BlockKind;
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
    primaryField: string;
}

function splitCommaList(value: string | undefined): string[] {
    return (value ?? "")
        .split(/[|,;]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function BlueprintLabCanvas() {
    const store = useStore();
    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [pendingBlock, setPendingBlock] = useState<PendingBlockCreation | null>(null);
    const [enumPanelOpen, setEnumPanelOpen] = useState(false);
    const [loadItemId, setLoadItemId] = useState("");
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [exportOk, setExportOk] = useState(false);
    const { screenToFlowPosition } = useReactFlow();
    const connectStart = useRef<{ nodeId: string; handleId: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Keeps GameStore in sync with whatever the canvas currently shows — runs on every node/edge change so a
    // field edit is reflected site-wide immediately, the same way editing a name/description already is
    // elsewhere. Existing (loaded) mechanic rows are merged in place and never marked for export; brand-new ones
    // are upserted by their own synthetic id (idempotent — re-running this on every keystroke never duplicates
    // a row) and marked exportable. See GameStore.upsertItem/updateMechanicRowFields/upsertMechanicRow.
    useEffect(() => {
        for (const node of nodes) {
            if (node.type !== "item") continue;
            const itemId = node.data.itemId.trim();
            if (!itemId) continue;
            store.upsertItem(itemId, node.data.itemType, {
                tags: node.data.tags,
                raw: { ...node.data.rawFields, PossibleColors: node.data.possibleColors.join(", ") },
            });
        }

        for (const node of nodes) {
            if (node.type !== "mechanic") continue;

            const ownsEdge = edges.find((e) => e.target === node.id && e.targetHandle === "owns");
            const itemNode = ownsEdge ? nodes.find((n) => n.id === ownsEdge.source) : undefined;
            if (!itemNode || itemNode.type !== "item" || !itemNode.data.itemId.trim()) continue;

            let fields: Record<string, string> = { ...node.data.fields };
            for (const edge of edges) {
                if (edge.source !== node.id || edge.targetHandle !== "in") continue;
                const blockNode = nodes.find((n) => n.id === edge.target);
                if (blockNode?.type === "block") fields = { ...fields, ...blockNode.data.fields };
            }

            if (node.data.existing) {
                store.updateMechanicRowFields(node.data.rowId, fields);
            } else {
                const row: MechanicRow = { id: node.data.rowId, table: node.data.kind, itemId: itemNode.data.itemId, fields };
                store.upsertMechanicRow(row);
            }
        }
    }, [nodes, edges, store]);

    const updateItemData = useCallback(
        (id: string, patch: Partial<Pick<ItemFlowNode["data"], "itemId" | "itemType" | "tags" | "possibleColors">>) => {
            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id !== id || n.type !== "item") return n;
                    // A brand-new draft's Name/Description have nowhere real to save to until it has an id —
                    // keep nameKey/descKey tracking itemId as it's typed (locked items keep their real, already-
                    // resolved keys, which can legitimately differ from the id itself — never overwritten here).
                    const derivedKeys =
                        !n.data.locked && patch.itemId !== undefined
                            ? { nameKey: patch.itemId, descKey: patch.itemId ? `${patch.itemId}_desc` : "" }
                            : {};
                    return { ...n, data: { ...n.data, ...patch, ...derivedKeys } };
                }),
            );
        },
        [setNodes],
    );

    const updateItemRawField = useCallback(
        (id: string, field: string, value: string) => {
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === id && n.type === "item" ? { ...n, data: { ...n.data, rawFields: { ...n.data.rawFields, [field]: value } } } : n,
                ),
            );
        },
        [setNodes],
    );

    const addMechanicNode = useCallback(
        (
            itemFlowId: string,
            kind: MechanicKind,
            options?: { initialFields?: Record<string, string>; rowId?: string; existing?: boolean; position?: { x: number; y: number } },
        ) => {
            const mechId = nextId("mech");
            const rowId = options?.rowId ?? `blueprint:${mechId}`;
            setNodes((nds) => {
                const item = nds.find((n) => n.id === itemFlowId);
                const mechNode: MechanicFlowNode = {
                    id: mechId,
                    type: "mechanic",
                    position: options?.position ?? { x: (item?.position.x ?? 0) + 360, y: (item?.position.y ?? 0) + nds.length * 20 },
                    data: {
                        kind,
                        fields: options?.initialFields ?? {},
                        rowId,
                        existing: options?.existing ?? false,
                        onKindChange: (newKind) =>
                            setNodes((cur) =>
                                cur.map((n) =>
                                    n.id === mechId && n.type === "mechanic"
                                        ? { ...n, data: { ...n.data, kind: newKind, fields: {} } }
                                        : n,
                                ),
                            ),
                        onFieldChange: (field, value) =>
                            setNodes((cur) =>
                                cur.map((n) =>
                                    n.id === mechId && n.type === "mechanic"
                                        ? { ...n, data: { ...n.data, fields: { ...n.data.fields, [field]: value } } }
                                        : n,
                                ),
                            ),
                    },
                };
                return [...nds, mechNode];
            });
            setEdges((eds) => [
                ...eds,
                {
                    id: nextId("edge"),
                    source: itemFlowId,
                    sourceHandle: "owns",
                    target: mechId,
                    targetHandle: "owns",
                    style: { strokeDasharray: "4 3", stroke: "#888" },
                    label: "содержит",
                },
            ]);
            return mechId;
        },
        [setNodes, setEdges],
    );

    const addItemNode = useCallback(
        (position: { x: number; y: number }, overrides?: Partial<ItemFlowNode["data"]>) => {
            const id = nextId("item");
            const node: ItemFlowNode = {
                id,
                type: "item",
                position,
                data: {
                    itemId: "",
                    locked: false,
                    nameKey: "",
                    descKey: "",
                    itemType: "Card",
                    tags: [],
                    possibleColors: [],
                    rawFields: {},
                    ...overrides,
                    onChange: (patch) => updateItemData(id, patch),
                    onRawFieldChange: (field, value) => updateItemRawField(id, field, value),
                    onAddMechanic: (kind) => addMechanicNode(id, kind),
                },
            };
            setNodes((nds) => [...nds, node]);
            return id;
        },
        [setNodes, updateItemData, updateItemRawField, addMechanicNode],
    );

    const addBlockNode = useCallback(
        (mechanicId: string, blockKind: BlockKind, fields: Record<string, string>, position: { x: number; y: number }) => {
            const blockId = nextId("block");
            const mechanicNode = nodes.find((n) => n.id === mechanicId);
            const mechanicKind = mechanicNode && mechanicNode.type === "mechanic" ? mechanicNode.data.kind : undefined;
            if (!mechanicKind) return;

            const node: BlockFlowNode = {
                id: blockId,
                type: "block",
                position,
                data: {
                    blockKind,
                    mechanicKind,
                    fields,
                    onFieldChange: (field, value) =>
                        setNodes((cur) =>
                            cur.map((n) =>
                                n.id === blockId && n.type === "block"
                                    ? { ...n, data: { ...n.data, fields: { ...n.data.fields, [field]: value } } }
                                    : n,
                            ),
                        ),
                },
            };
            setNodes((nds) => [...nds, node]);
            setEdges((eds) => [
                ...eds,
                {
                    id: nextId("edge"),
                    source: mechanicId,
                    sourceHandle: blockKind,
                    target: blockId,
                    targetHandle: "in",
                    label: blockLabel(blockKind),
                },
            ]);
            return blockId;
        },
        [nodes, setNodes, setEdges],
    );

    const loadItem = useCallback(() => {
        const item = store.getItem(loadItemId.trim());
        if (!item) return;

        idCounter += 1; // fresh id namespace per load, avoids any collision with whatever was on canvas before
        const itemType = (item.itemType as ItemKind) ?? "Card";
        const rawFields: Record<string, string> = {};
        for (const col of ITEM_CATEGORY_COLUMNS[itemType]) {
            if (item.raw[col]) rawFields[col] = item.raw[col];
        }

        const itemFlowId = nextId("item");
        const itemNode: ItemFlowNode = {
            id: itemFlowId,
            type: "item",
            position: { x: 40, y: 40 },
            data: {
                itemId: item.id,
                locked: true,
                nameKey: item.nameKey ?? item.id,
                descKey: item.descKey ?? `${item.id}_desc`,
                itemType,
                tags: item.tags,
                possibleColors: splitCommaList(item.raw.PossibleColors),
                rawFields,
                onChange: (patch) => updateItemData(itemFlowId, patch),
                onRawFieldChange: (field, value) => updateItemRawField(itemFlowId, field, value),
                onAddMechanic: (kind) => addMechanicNode(itemFlowId, kind),
            },
        };

        const newNodes: FlowNode[] = [itemNode];
        const newEdges: Edge[] = [];
        let y = 0;

        for (const row of store.mechanics.filter((r) => r.itemId === item.id)) {
            const kind = row.table as MechanicKind;
            if (!MECHANIC_BLOCKS[kind]) continue; // skip Unknown/unrecognized tables

            const mechId = nextId("mech");
            const misc: Record<string, string> = {};
            for (const f of MECHANIC_MISC_FIELDS[kind]) if (row.fields[f]) misc[f] = row.fields[f];

            newNodes.push({
                id: mechId,
                type: "mechanic",
                position: { x: 400, y },
                data: {
                    kind,
                    fields: misc,
                    rowId: row.id,
                    existing: true,
                    onKindChange: (newKind) =>
                        setNodes((cur) =>
                            cur.map((n) => (n.id === mechId && n.type === "mechanic" ? { ...n, data: { ...n.data, kind: newKind, fields: {} } } : n)),
                        ),
                    onFieldChange: (field, value) =>
                        setNodes((cur) =>
                            cur.map((n) =>
                                n.id === mechId && n.type === "mechanic"
                                    ? { ...n, data: { ...n.data, fields: { ...n.data.fields, [field]: value } } }
                                    : n,
                            ),
                        ),
                },
            });
            newEdges.push({
                id: nextId("edge"),
                source: itemFlowId,
                sourceHandle: "owns",
                target: mechId,
                targetHandle: "owns",
                style: { strokeDasharray: "4 3", stroke: "#888" },
                label: "содержит",
            });

            let blockY = y;
            for (const block of MECHANIC_BLOCKS[kind]) {
                const primaryValue = row.fields[block.primaryField];
                if (!primaryValue) continue; // this mechanic doesn't currently have this aspect

                const blockFields: Record<string, string> = { [block.primaryField]: primaryValue };
                for (const f of block.otherFields) if (row.fields[f]) blockFields[f] = row.fields[f];

                const blockId = nextId("block");
                newNodes.push({
                    id: blockId,
                    type: "block",
                    position: { x: block.side === "left" ? 40 : 760, y: blockY },
                    data: {
                        blockKind: block.kind,
                        mechanicKind: kind,
                        fields: blockFields,
                        onFieldChange: (field, value) =>
                            setNodes((cur) =>
                                cur.map((n) =>
                                    n.id === blockId && n.type === "block"
                                        ? { ...n, data: { ...n.data, fields: { ...n.data.fields, [field]: value } } }
                                        : n,
                                ),
                            ),
                    },
                });
                newEdges.push({
                    id: nextId("edge"),
                    source: mechId,
                    sourceHandle: block.kind,
                    target: blockId,
                    targetHandle: "in",
                    label: blockLabel(block.kind),
                });
                blockY += 280;
            }

            y += Math.max(320, blockY - y + 40);
        }

        setNodes(newNodes);
        setEdges(newEdges);
    }, [store, loadItemId, setNodes, setEdges, updateItemData, updateItemRawField, addMechanicNode]);

    const handleExport = useCallback(async () => {
        setExporting(true);
        setExportError(null);
        setExportOk(false);
        try {
            const result = await store.exportBlueprintChanges();
            if (result.ok) setExportOk(true);
            else setExportError(result.error ?? "Экспорт не удался");
        } catch (error) {
            setExportError(error instanceof Error ? error.message : String(error));
        } finally {
            setExporting(false);
        }
    }, [store]);

    const onConnect = useCallback(
        (connection: Connection) => {
            const sourceNode = nodes.find((n) => n.id === connection.source);
            let label: string | undefined;
            if (connection.sourceHandle === "owns") label = "содержит";
            else if (sourceNode?.type === "mechanic") {
                const kind = MECHANIC_BLOCKS[sourceNode.data.kind].find((b) => b.kind === connection.sourceHandle)?.kind;
                if (kind) label = blockLabel(kind);
            }
            setEdges((eds) => addEdge({ ...connection, id: nextId("edge"), label }, eds));
        },
        [setEdges, nodes],
    );

    const onConnectStart: OnConnectStart = useCallback((_event, params) => {
        connectStart.current = params.nodeId && params.handleId ? { nodeId: params.nodeId, handleId: params.handleId } : null;
    }, []);

    const onConnectEnd = useCallback(
        (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
            const start = connectStart.current;
            connectStart.current = null;
            if (!start || connectionState.isValid) return;
            if (start.handleId === "owns") return;

            const sourceNode = nodes.find((n) => n.id === start.nodeId);
            if (!sourceNode || sourceNode.type !== "mechanic") return;

            const definition = MECHANIC_BLOCKS[sourceNode.data.kind].find((b) => b.kind === start.handleId);
            if (!definition) return;

            const point = "changedTouches" in event ? event.changedTouches[0] : event;
            const flowPos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
            const bounds = containerRef.current?.getBoundingClientRect();
            const localX = point.clientX - (bounds?.left ?? 0);
            const localY = point.clientY - (bounds?.top ?? 0);

            setPendingBlock({
                mechanicId: sourceNode.id,
                blockKind: definition.kind,
                screenX: localX,
                screenY: localY,
                flowX: flowPos.x,
                flowY: flowPos.y,
                primaryField: definition.primaryField,
            });
        },
        [nodes, screenToFlowPosition],
    );

    const isValidConnection: IsValidConnection = useCallback((edgeOrConn) => {
        const sourceHandle = "sourceHandle" in edgeOrConn ? edgeOrConn.sourceHandle : undefined;
        const targetHandle = "targetHandle" in edgeOrConn ? edgeOrConn.targetHandle : undefined;
        if (sourceHandle === "owns") return targetHandle === "owns";
        return targetHandle === "in";
    }, []);

    const closePendingBlock = useCallback(() => setPendingBlock(null), []);

    const confirmBlockValue = useCallback(
        (value: string) => {
            if (!pendingBlock) return;
            addBlockNode(pendingBlock.mechanicId, pendingBlock.blockKind, { [pendingBlock.primaryField]: value }, {
                x: pendingBlock.flowX,
                y: pendingBlock.flowY,
            });
            setPendingBlock(null);
        },
        [pendingBlock, addBlockNode],
    );

    const itemCandidates = nodes.filter((n): n is ItemFlowNode => n.type === "item");
    const itemOptions = [
        ...store.items.map((item) => ({ id: item.id, name: store.itemName(item), source: "real" as const })),
        ...itemCandidates.map((n) => ({ id: n.id, name: store.getTranslation(n.data.nameKey) || n.data.itemId, source: "canvas" as const })),
    ];

    return (
        <ItemRegistryProvider items={itemOptions}>
            <Box sx={{ position: "relative", height: "calc(100vh - 96px)" }}>
                <Stack direction="row" spacing={2} sx={{ mb: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Button variant="contained" onClick={() => addItemNode({ x: 40, y: 40 + nodes.length * 10 })}>
                        + Новый предмет
                    </Button>

                    <Box sx={{ width: 260 }}>
                        <ItemRefSelect field="Загрузить предмет" value={loadItemId} onChange={setLoadItemId} />
                    </Box>
                    <Button variant="outlined" disabled={!loadItemId} onClick={loadItem}>
                        Загрузить
                    </Button>

                    <Button variant="outlined" onClick={() => setEnumPanelOpen(true)}>
                        Enum-справочник
                    </Button>

                    <Button
                        variant="outlined"
                        color="warning"
                        disabled={exporting || store.blueprintPendingExportCount === 0}
                        onClick={handleExport}
                    >
                        {exporting
                            ? "Экспортирую…"
                            : `Экспортировать в таблицу (${store.blueprintPendingExportCount})`}
                    </Button>

                    <Typography variant="body2" color="text.secondary">
                        Правки сразу видны на сайте (Предметы/Билды и т.д.); экспорт пишет напрямую в реальную
                        живую таблицу — новые предметы/механики обновляются по ItemId, новые строки механик
                        только добавляются.
                    </Typography>
                </Stack>

                {exportError && (
                    <Alert severity="error" onClose={() => setExportError(null)} sx={{ mb: 1 }}>
                        {exportError}
                    </Alert>
                )}
                {exportOk && (
                    <Alert severity="success" onClose={() => setExportOk(false)} sx={{ mb: 1 }}>
                        Экспортировано.
                    </Alert>
                )}

                <EnumPanel open={enumPanelOpen} onClose={() => setEnumPanelOpen(false)} />

                <Box
                    ref={containerRef}
                    sx={{ position: "relative", height: "100%", border: "1px solid", borderColor: "divider", borderRadius: 1 }}
                >
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onConnectStart={onConnectStart}
                        onConnectEnd={onConnectEnd}
                        isValidConnection={isValidConnection}
                        fitView
                    >
                        <Background />
                        <Controls />
                        <MiniMap />
                    </ReactFlow>

                    {pendingBlock && (
                        <PrimaryValueMenu
                            x={pendingBlock.screenX}
                            y={pendingBlock.screenY}
                            fieldLabel={pendingBlock.primaryField}
                            onConfirm={confirmBlockValue}
                            onClose={closePendingBlock}
                        />
                    )}
                </Box>
            </Box>
        </ItemRegistryProvider>
    );
}

export default function BlueprintLabPage() {
    return (
        <Stack spacing={2}>
            <Typography variant="h4">🧪 Blueprint-редактор контента (лаборатория)</Typography>
            <Alert severity="info">
                Раздел на отдельной ветке. Загруженный/созданный предмет и его механики правятся прямо здесь и
                сразу отражаются на сайте; в реальную таблицу конфигурации ничего не уходит без отдельного экспорта.
            </Alert>
            <EnumRegistryProvider>
                <ReactFlowProvider>
                    <BlueprintLabCanvas />
                </ReactFlowProvider>
            </EnumRegistryProvider>
        </Stack>
    );
}
