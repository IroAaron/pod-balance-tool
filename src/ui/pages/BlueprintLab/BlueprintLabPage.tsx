import { useCallback, useRef, useState } from "react";
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

import ItemNode from "./ItemNode";
import MechanicNode from "./MechanicNode";
import BlockNode from "./BlockNode";
import ConnectionMenu from "./ConnectionMenu";
import PrimaryValueMenu from "./PrimaryValueMenu";
import EnumPanel from "./EnumPanel";
import { EnumRegistryProvider } from "./EnumRegistryContext";
import { MECHANIC_BLOCKS, blockLabel } from "./mechanicSchema";
import type { BlockFlowNode, BlockKind, ItemFlowNode, MechanicFlowNode, MechanicKind } from "./types";

const nodeTypes = { item: ItemNode, mechanic: MechanicNode, block: BlockNode };

let idCounter = 0;
function nextId(prefix: string) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}

type FlowNode = ItemFlowNode | MechanicFlowNode | BlockFlowNode;

interface PendingItemConnection {
    kind: "item";
    sourceNodeId: string;
    sourceHandleId: string;
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
    roleLabel: string;
}

interface PendingBlockCreation {
    kind: "block";
    mechanicId: string;
    blockKind: BlockKind;
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
    primaryField: string;
}

function makeItemData(overrides?: Partial<{ name: string; itemType: ItemFlowNode["data"]["itemType"]; tags: string[] }>) {
    return {
        name: overrides?.name ?? "Новый предмет",
        itemType: overrides?.itemType ?? "Card",
        tags: overrides?.tags ?? [],
    };
}

function BlueprintLabCanvas() {
    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [pendingItem, setPendingItem] = useState<PendingItemConnection | null>(null);
    const [pendingBlock, setPendingBlock] = useState<PendingBlockCreation | null>(null);
    const [enumPanelOpen, setEnumPanelOpen] = useState(false);
    const { screenToFlowPosition } = useReactFlow();
    const connectStart = useRef<{ nodeId: string; handleId: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const updateItemData = useCallback(
        (id: string, patch: Partial<{ name: string; itemType: ItemFlowNode["data"]["itemType"]; tags: string[] }>) => {
            setNodes((nds) =>
                nds.map((n) => (n.id === id && n.type === "item" ? { ...n, data: { ...n.data, ...patch } } : n)),
            );
        },
        [setNodes],
    );

    const addMechanicNode = useCallback(
        (itemId: string, kind: MechanicKind) => {
            setNodes((nds) => {
                const item = nds.find((n) => n.id === itemId);
                const mechId = nextId("mech");
                const mechNode: MechanicFlowNode = {
                    id: mechId,
                    type: "mechanic",
                    position: { x: (item?.position.x ?? 0) + 320, y: (item?.position.y ?? 0) + nds.length * 20 },
                    data: {
                        kind,
                        fields: {},
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
                setEdges((eds) => [
                    ...eds,
                    {
                        id: nextId("edge"),
                        source: itemId,
                        sourceHandle: "owns",
                        target: mechId,
                        targetHandle: "owns",
                        style: { strokeDasharray: "4 3", stroke: "#888" },
                        label: "содержит",
                    },
                ]);
                return [...nds, mechNode];
            });
        },
        [setNodes, setEdges],
    );

    const addItemNode = useCallback(
        (position: { x: number; y: number }) => {
            const id = nextId("item");
            const node: ItemFlowNode = {
                id,
                type: "item",
                position,
                data: {
                    ...makeItemData(),
                    onChange: (patch) => updateItemData(id, patch),
                    onAddMechanic: (kind) => addMechanicNode(id, kind),
                },
            };
            setNodes((nds) => [...nds, node]);
            return id;
        },
        [setNodes, updateItemData, addMechanicNode],
    );

    const addBlockNode = useCallback(
        (mechanicId: string, blockKind: BlockKind, primaryField: string, primaryValue: string, position: { x: number; y: number }) => {
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
                    fields: { [primaryField]: primaryValue },
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
        },
        [nodes, setNodes, setEdges],
    );

    const onConnect = useCallback(
        (connection: Connection) => {
            const sourceNode = nodes.find((n) => n.id === connection.source);
            let label: string | undefined;
            if (connection.sourceHandle === "owns") label = "содержит";
            else if (connection.sourceHandle === "itemRef" && sourceNode?.type === "block") {
                label = MECHANIC_BLOCKS[sourceNode.data.mechanicKind].find((b) => b.kind === sourceNode.data.blockKind)?.itemRefField;
            } else if (sourceNode?.type === "mechanic") {
                label = MECHANIC_BLOCKS[sourceNode.data.kind].find((b) => b.kind === connection.sourceHandle)?.kind;
                if (label) label = blockLabel(label as BlockKind);
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
            if (!sourceNode) return;

            const point = "changedTouches" in event ? event.changedTouches[0] : event;
            const flowPos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
            const bounds = containerRef.current?.getBoundingClientRect();
            const localX = point.clientX - (bounds?.left ?? 0);
            const localY = point.clientY - (bounds?.top ?? 0);

            if (sourceNode.type === "mechanic") {
                const definition = MECHANIC_BLOCKS[sourceNode.data.kind].find((b) => b.kind === start.handleId);
                if (!definition) return;

                setPendingBlock({
                    kind: "block",
                    mechanicId: sourceNode.id,
                    blockKind: definition.kind,
                    screenX: localX,
                    screenY: localY,
                    flowX: flowPos.x,
                    flowY: flowPos.y,
                    primaryField: definition.primaryField,
                });
                return;
            }

            if (sourceNode.type === "block" && start.handleId === "itemRef") {
                const definition = MECHANIC_BLOCKS[sourceNode.data.mechanicKind].find((b) => b.kind === sourceNode.data.blockKind);
                if (!definition?.itemRefField) return;

                setPendingItem({
                    kind: "item",
                    sourceNodeId: sourceNode.id,
                    sourceHandleId: "itemRef",
                    screenX: localX,
                    screenY: localY,
                    flowX: flowPos.x,
                    flowY: flowPos.y,
                    roleLabel: definition.itemRefField,
                });
            }
        },
        [nodes, screenToFlowPosition],
    );

    const isValidConnection: IsValidConnection = useCallback((edgeOrConn) => {
        const sourceHandle = "sourceHandle" in edgeOrConn ? edgeOrConn.sourceHandle : undefined;
        const targetHandle = "targetHandle" in edgeOrConn ? edgeOrConn.targetHandle : undefined;
        if (sourceHandle === "owns") return targetHandle === "owns";
        if (sourceHandle === "itemRef") return targetHandle === "ref";
        return targetHandle === "in";
    }, []);

    const closePendingItem = useCallback(() => setPendingItem(null), []);
    const closePendingBlock = useCallback(() => setPendingBlock(null), []);

    const pickExistingItem = useCallback(
        (itemId: string) => {
            if (!pendingItem) return;
            setEdges((eds) => [
                ...eds,
                {
                    id: nextId("edge"),
                    source: pendingItem.sourceNodeId,
                    sourceHandle: pendingItem.sourceHandleId,
                    target: itemId,
                    targetHandle: "ref",
                    label: pendingItem.roleLabel,
                },
            ]);
            setPendingItem(null);
        },
        [pendingItem, setEdges],
    );

    const createAndConnectItem = useCallback(() => {
        if (!pendingItem) return;
        const newId = addItemNode({ x: pendingItem.flowX, y: pendingItem.flowY });
        setEdges((eds) => [
            ...eds,
            {
                id: nextId("edge"),
                source: pendingItem.sourceNodeId,
                sourceHandle: pendingItem.sourceHandleId,
                target: newId,
                targetHandle: "ref",
                label: pendingItem.roleLabel,
            },
        ]);
        setPendingItem(null);
    }, [pendingItem, addItemNode, setEdges]);

    const confirmBlockValue = useCallback(
        (value: string) => {
            if (!pendingBlock) return;
            addBlockNode(pendingBlock.mechanicId, pendingBlock.blockKind, pendingBlock.primaryField, value, {
                x: pendingBlock.flowX,
                y: pendingBlock.flowY,
            });
            setPendingBlock(null);
        },
        [pendingBlock, addBlockNode],
    );

    const itemCandidates = nodes.filter((n): n is ItemFlowNode => n.type === "item");

    return (
        <Box sx={{ position: "relative", height: "calc(100vh - 96px)" }}>
            <Stack direction="row" spacing={2} sx={{ mb: 1, alignItems: "center" }}>
                <Button variant="contained" onClick={() => addItemNode({ x: 40, y: 40 + nodes.length * 10 })}>
                    + Добавить предмет
                </Button>
                <Button variant="outlined" onClick={() => setEnumPanelOpen(true)}>
                    Enum-справочник
                </Button>
                <Typography variant="body2" color="text.secondary">
                    Экспериментальный раздел — ничего не сохраняется и никуда не экспортируется.
                </Typography>
            </Stack>

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

                {pendingItem && (
                    <ConnectionMenu
                        x={pendingItem.screenX}
                        y={pendingItem.screenY}
                        roleLabel={pendingItem.roleLabel}
                        candidates={itemCandidates}
                        onPick={pickExistingItem}
                        onCreate={createAndConnectItem}
                        onClose={closePendingItem}
                    />
                )}

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
    );
}

export default function BlueprintLabPage() {
    return (
        <Stack spacing={2}>
            <Typography variant="h4">🧪 Blueprint-редактор контента (лаборатория)</Typography>
            <Alert severity="info">
                Пробный раздел на отдельной ветке — тестируем удобство создания контента через ноды. Не связан с
                остальными вкладками, ничего не сохраняется между перезагрузками.
            </Alert>
            <EnumRegistryProvider>
                <ReactFlowProvider>
                    <BlueprintLabCanvas />
                </ReactFlowProvider>
            </EnumRegistryProvider>
        </Stack>
    );
}
