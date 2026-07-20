import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { useStore } from "../hooks/useStore";
import ItemIcon from "./ItemIcon";
import ItemDescription from "./ItemDescription";
import { computeBuildTree, type BuildTreeNode } from "../../core/domain/buildTree";
import type { Build } from "../../core/models/Build";

type Props = {
    build: Build;
};

type Edge = { parentId: string; childId: string; x1: number; y1: number; x2: number; y2: number };

function edgeKey(parentId: string, childId: string): string {
    return `${parentId}--${childId}`;
}

function tierLabel(tier: number): string {
    if (tier === 0) return "Головной предмет";
    if (tier === 1) return "1 ступень — прямая связь (Card)";
    if (tier === 2) return "2 ступень — прямая связь (House/Artefact)";
    return `${tier} ступень — непрямая связь`;
}

type TreeNodeProps = {
    node: BuildTreeNode;
    nodeRefs: React.MutableRefObject<Map<string, HTMLElement>>;
    dimmed: boolean;
    onHoverStart: () => void;
    onHoverEnd: () => void;
};

/** One tree node: item icon only (name/description live in the hover tooltip), registers itself in `nodeRefs`
 *  so the parent can measure it for edge lines. */
function TreeNode({ node, nodeRefs, dimmed, onHoverStart, onHoverEnd }: TreeNodeProps) {
    const store = useStore();
    const item = store.getItem(node.itemId);
    const name = item ? store.itemName(item) : node.itemId;
    const description = item ? store.itemDescription(item) : "";

    return (
        <Tooltip
            title={
                <>
                    {name}
                    {item && description && (
                        <>
                            <br />
                            <ItemDescription item={item} description={description} />
                        </>
                    )}
                </>
            }
        >
            <Box
                ref={(el: HTMLElement | null) => {
                    if (el) nodeRefs.current.set(node.itemId, el);
                    else nodeRefs.current.delete(node.itemId);
                }}
                component={RouterLink}
                to={`/items/${encodeURIComponent(node.itemId)}`}
                onMouseEnter={onHoverStart}
                onMouseLeave={onHoverEnd}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    p: 1,
                    width: 56,
                    height: 56,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    textDecoration: "none",
                    color: "inherit",
                    bgcolor: "background.paper",
                    position: "relative",
                    opacity: dimmed ? 0.3 : 1,
                    transition: "opacity 0.15s",
                }}
            >
                {item ? <ItemIcon item={item} size={32} /> : <Typography sx={{ fontSize: 26 }}>🧩</Typography>}
            </Box>
        </Tooltip>
    );
}

/**
 * Tiered top-to-bottom visualization of a build's own membership, per tier (see computeBuildTree): head item,
 * direct Card connections, direct House/Artefact connections, then increasingly indirect connections below.
 * Connector lines are computed by measuring each node's DOM position (getBoundingClientRect) rather than a
 * layout library — fine at this scale (a build's item count), recomputed via ResizeObserver so image loads and
 * window resizes don't leave stale lines.
 */
export default function BuildTree({ build }: Props) {
    const store = useStore();

    const { nodes, unconnected } = useMemo(
        () => computeBuildTree(build, store.items, store.mechanics, store.upgradeChains, store.replaceRules),
        [build, store.items, store.mechanics, store.upgradeChains, store.replaceRules]
    );

    const tiers = useMemo(() => {
        const byTier = new Map<number, BuildTreeNode[]>();
        for (const node of nodes) {
            if (!byTier.has(node.tier)) byTier.set(node.tier, []);
            byTier.get(node.tier)!.push(node);
        }
        return [...byTier.entries()].sort(([a], [b]) => a - b);
    }, [nodes]);

    // Bidirectional adjacency (parent<->child) derived from the tree's directed parent links — used for hover
    // highlighting, where "connected to" means either direction, not just "is my tree-parent".
    const neighborsOf = useMemo(() => {
        const map = new Map<string, Set<string>>();
        const link = (a: string, b: string) => {
            if (!map.has(a)) map.set(a, new Set());
            map.get(a)!.add(b);
        };
        for (const node of nodes) {
            for (const parentId of node.parents) {
                link(node.itemId, parentId);
                link(parentId, node.itemId);
            }
        }
        return map;
    }, [nodes]);

    const nodeRefs = useRef(new Map<string, HTMLElement>());
    const containerRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);

    // store.items/mechanics/etc. are getters that return a fresh array on every access, so `nodes` is a new
    // array reference every render even when its contents are identical — depending the effect on `nodes`
    // itself would re-run (and setEdges) every render forever. This derived string is stable across renders
    // that produce the same actual tree, which is what breaks that loop.
    const nodesKey = nodes.map((node) => `${node.itemId}:${node.tier}:${node.parents.join(",")}`).join("|");

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const computeEdges = () => {
            const containerRect = container.getBoundingClientRect();
            const next: Edge[] = [];

            for (const node of nodes) {
                const childEl = nodeRefs.current.get(node.itemId);
                if (!childEl) continue;
                const childRect = childEl.getBoundingClientRect();

                for (const parentId of node.parents) {
                    const parentEl = nodeRefs.current.get(parentId);
                    if (!parentEl) continue;
                    const parentRect = parentEl.getBoundingClientRect();

                    next.push({
                        parentId,
                        childId: node.itemId,
                        x1: parentRect.left + parentRect.width / 2 - containerRect.left,
                        y1: parentRect.bottom - containerRect.top,
                        x2: childRect.left + childRect.width / 2 - containerRect.left,
                        y2: childRect.top - containerRect.top,
                    });
                }
            }

            setEdges(next);
        };

        computeEdges();
        const observer = new ResizeObserver(computeEdges);
        observer.observe(container);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on nodesKey, not `nodes` (see above)
    }, [nodesKey]);

    // Hovering a node highlights it, everything it's connected to, and every edge touching it. Hovering an edge
    // highlights just that edge and its two endpoint items. `null` means "nothing hovered" — full opacity for all.
    const highlightedItemIds = useMemo(() => {
        if (hoveredItemId) {
            const ids = new Set<string>([hoveredItemId]);
            for (const id of neighborsOf.get(hoveredItemId) ?? []) ids.add(id);
            return ids;
        }
        if (hoveredEdgeKey) {
            const [parentId, childId] = hoveredEdgeKey.split("--");
            return new Set([parentId, childId]);
        }
        return null;
    }, [hoveredItemId, hoveredEdgeKey, neighborsOf]);

    const highlightedEdgeKeys = useMemo(() => {
        if (hoveredItemId) {
            return new Set(
                edges
                    .filter((edge) => edge.parentId === hoveredItemId || edge.childId === hoveredItemId)
                    .map((edge) => edgeKey(edge.parentId, edge.childId))
            );
        }
        if (hoveredEdgeKey) return new Set([hoveredEdgeKey]);
        return null;
    }, [hoveredItemId, hoveredEdgeKey, edges]);

    if (build.items.length === 0) return null;

    return (
        <Box>
            <Box ref={containerRef} sx={{ position: "relative" }}>
                <Box
                    component="svg"
                    sx={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                >
                    {edges.map((edge) => {
                        const key = edgeKey(edge.parentId, edge.childId);
                        const isHighlighted = !highlightedEdgeKeys || highlightedEdgeKeys.has(key);
                        return (
                            <g key={key}>
                                <line
                                    x1={edge.x1}
                                    y1={edge.y1}
                                    x2={edge.x2}
                                    y2={edge.y2}
                                    stroke="#5B8CFF"
                                    strokeWidth={isHighlighted ? 2.5 : 1.5}
                                    opacity={isHighlighted ? 0.9 : 0.15}
                                    style={{ pointerEvents: "none", transition: "opacity 0.15s" }}
                                />
                                {/* Wider invisible line on top, just for a comfortable hover hit-area on a 1.5px line. */}
                                <line
                                    x1={edge.x1}
                                    y1={edge.y1}
                                    x2={edge.x2}
                                    y2={edge.y2}
                                    stroke="transparent"
                                    strokeWidth={14}
                                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                    onMouseEnter={() => {
                                        setHoveredEdgeKey(key);
                                        setHoveredItemId(null);
                                    }}
                                    onMouseLeave={() => setHoveredEdgeKey((current) => (current === key ? null : current))}
                                />
                            </g>
                        );
                    })}
                </Box>

                <Stack spacing={4}>
                    {tiers.map(([tier, tierNodes]) => (
                        <Box key={tier}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                {tierLabel(tier)}
                            </Typography>
                            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
                                {tierNodes.map((node) => (
                                    <TreeNode
                                        key={node.itemId}
                                        node={node}
                                        nodeRefs={nodeRefs}
                                        dimmed={highlightedItemIds !== null && !highlightedItemIds.has(node.itemId)}
                                        onHoverStart={() => {
                                            setHoveredItemId(node.itemId);
                                            setHoveredEdgeKey(null);
                                        }}
                                        onHoverEnd={() => setHoveredItemId((current) => (current === node.itemId ? null : current))}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            </Box>

            {unconnected.length > 0 && (
                <Box sx={{ mt: 3 }}>
                    <Typography variant="caption" color="text.secondary">
                        Без найденной связи с головным предметом:
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 1 }}>
                        {unconnected.map((id) => {
                            const item = store.getItem(id);
                            return (
                                <Chip
                                    key={id}
                                    component={RouterLink}
                                    to={`/items/${encodeURIComponent(id)}`}
                                    clickable
                                    label={item ? store.itemName(item) : id}
                                    size="small"
                                    variant="outlined"
                                />
                            );
                        })}
                    </Stack>
                </Box>
            )}
        </Box>
    );
}
