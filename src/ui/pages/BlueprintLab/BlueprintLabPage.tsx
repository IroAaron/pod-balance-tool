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
import ConnectionMenu from "./ConnectionMenu";
import { MECHANIC_REF_POINTS } from "./mechanicSchema";
import type { ItemFlowNode, MechanicFlowNode, MechanicKind } from "./types";

const nodeTypes = { item: ItemNode, mechanic: MechanicNode };

let idCounter = 0;
function nextId(prefix: string) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}

function refRoleLabel(kind: MechanicKind, handleId: string): string {
    if (handleId === "activator") return "Активатор";
    return MECHANIC_REF_POINTS[kind].find((p) => p.key === handleId)?.label ?? handleId;
}

interface PendingConnection {
    sourceNodeId: string;
    sourceHandleId: string;
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
    roleLabel: string;
}

function makeItemData(overrides?: Partial<{ name: string; itemType: ItemFlowNode["data"]["itemType"]; tags: string }>) {
    return {
        name: overrides?.name ?? "Новый предмет",
        itemType: overrides?.itemType ?? "Card",
        tags: overrides?.tags ?? "",
    };
}

function BlueprintLabCanvas() {
    const [nodes, setNodes, onNodesChange] = useNodesState<ItemFlowNode | MechanicFlowNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [pending, setPending] = useState<PendingConnection | null>(null);
    const { screenToFlowPosition } = useReactFlow();
    const connectStartRole = useRef<{ nodeId: string; handleId: string } | null>(null);

    const updateItemData = useCallback(
        (id: string, patch: Partial<{ name: string; itemType: ItemFlowNode["data"]["itemType"]; tags: string }>) => {
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

    const onConnect = useCallback(
        (connection: Connection) => {
            setEdges((eds) =>
                addEdge(
                    {
                        ...connection,
                        id: nextId("edge"),
                        label: connection.sourceHandle ? refRoleLabelFromNode(nodes, connection.source, connection.sourceHandle) : undefined,
                    },
                    eds,
                ),
            );
        },
        [setEdges, nodes],
    );

    const onConnectStart: OnConnectStart = useCallback((_event, params) => {
        connectStartRole.current = params.nodeId && params.handleId ? { nodeId: params.nodeId, handleId: params.handleId } : null;
    }, []);

    const onConnectEnd = useCallback(
        (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
            const start = connectStartRole.current;
            connectStartRole.current = null;
            if (!start || connectionState.isValid) return;
            // Only mechanic reference points (not the "owns" handle) open the picker.
            if (start.handleId === "owns") return;

            const sourceNode = nodes.find((n) => n.id === start.nodeId);
            if (!sourceNode || sourceNode.type !== "mechanic") return;

            const point = "changedTouches" in event ? event.changedTouches[0] : event;
            const flowPos = screenToFlowPosition({ x: point.clientX, y: point.clientY });

            setPending({
                sourceNodeId: start.nodeId,
                sourceHandleId: start.handleId,
                screenX: point.clientX,
                screenY: point.clientY,
                flowX: flowPos.x,
                flowY: flowPos.y,
                roleLabel: refRoleLabel(sourceNode.data.kind, start.handleId),
            });
        },
        [nodes, screenToFlowPosition],
    );

    const isValidConnection: IsValidConnection = useCallback(
        (edgeOrConn) => {
            const sourceHandle = "sourceHandle" in edgeOrConn ? edgeOrConn.sourceHandle : undefined;
            const targetHandle = "targetHandle" in edgeOrConn ? edgeOrConn.targetHandle : undefined;
            if (sourceHandle === "owns") return targetHandle === "owns";
            return targetHandle === "ref";
        },
        [],
    );

    const closePending = useCallback(() => setPending(null), []);

    const pickExistingItem = useCallback(
        (itemId: string) => {
            if (!pending) return;
            setEdges((eds) => [
                ...eds,
                {
                    id: nextId("edge"),
                    source: pending.sourceNodeId,
                    sourceHandle: pending.sourceHandleId,
                    target: itemId,
                    targetHandle: "ref",
                    label: pending.roleLabel,
                },
            ]);
            setPending(null);
        },
        [pending, setEdges],
    );

    const createAndConnectItem = useCallback(() => {
        if (!pending) return;
        const newId = addItemNode({ x: pending.flowX, y: pending.flowY });
        setEdges((eds) => [
            ...eds,
            {
                id: nextId("edge"),
                source: pending.sourceNodeId,
                sourceHandle: pending.sourceHandleId,
                target: newId,
                targetHandle: "ref",
                label: pending.roleLabel,
            },
        ]);
        setPending(null);
    }, [pending, addItemNode, setEdges]);

    const itemCandidates = nodes.filter((n): n is ItemFlowNode => n.type === "item");

    return (
        <Box sx={{ position: "relative", height: "calc(100vh - 96px)" }}>
            <Stack direction="row" spacing={2} sx={{ mb: 1, alignItems: "center" }}>
                <Button variant="contained" onClick={() => addItemNode({ x: 40, y: 40 + nodes.length * 10 })}>
                    + Добавить предмет
                </Button>
                <Typography variant="body2" color="text.secondary">
                    Экспериментальный раздел — ничего не сохраняется и никуда не экспортируется.
                </Typography>
            </Stack>

            <Box sx={{ position: "relative", height: "100%", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
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

                {pending && (
                    <ConnectionMenu
                        x={pending.screenX}
                        y={pending.screenY}
                        roleLabel={pending.roleLabel}
                        candidates={itemCandidates}
                        onPick={pickExistingItem}
                        onCreate={createAndConnectItem}
                        onClose={closePending}
                    />
                )}
            </Box>
        </Box>
    );
}

function refRoleLabelFromNode(nodes: (ItemFlowNode | MechanicFlowNode)[], sourceId: string, handleId: string) {
    const source = nodes.find((n) => n.id === sourceId);
    if (!source || source.type !== "mechanic") return undefined;
    return refRoleLabel(source.data.kind, handleId);
}

export default function BlueprintLabPage() {
    return (
        <Stack spacing={2}>
            <Typography variant="h4">🧪 Blueprint-редактор контента (лаборатория)</Typography>
            <Alert severity="info">
                Пробный раздел на отдельной ветке — тестируем удобство создания контента через ноды. Не связан с
                остальными вкладками, ничего не сохраняется между перезагрузками.
            </Alert>
            <ReactFlowProvider>
                <BlueprintLabCanvas />
            </ReactFlowProvider>
        </Stack>
    );
}
