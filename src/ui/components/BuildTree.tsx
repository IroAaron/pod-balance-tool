import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useStore } from "../hooks/useStore";
import ItemIcon from "./ItemIcon";
import ItemDescription from "./ItemDescription";
import DetailModal from "./DetailModal";
import ItemDetailPage from "../pages/Items/ItemDetailPage";
import {
    computeCascadeLevels,
    SCALING_EDGE_REASON_LABELS,
    type CascadeLevelNode,
    type ScalingEdgeReason,
} from "../../core/domain/relations";
import type { Build } from "../../core/models/Build";

type Props = {
    build: Build;
};

type Edge = {
    parentId: string;
    childId: string;
    reason: ScalingEdgeReason;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};

function edgeKey(parentId: string, childId: string): string {
    return `${parentId}--${childId}`;
}

const DEFAULT_EDGE_COLOR = "#5B8CFF";

/** Orange into a combo (ingredient feeding it), green out of one (the combo producing its result) — same colors
 *  the old, since-removed buildTree.ts used — everything else is plain blue. Known directly from the edge's own
 *  `reason` now (combo-ingredient/combo-result), no separate combo lookup needed. */
function edgeColor(reason: ScalingEdgeReason): string {
    if (reason === "combo-ingredient") return "#ffb74d";
    if (reason === "combo-result") return "#66bb6a";
    return DEFAULT_EDGE_COLOR;
}

/** One <marker> id per edge color (SVG markers can't take a dynamic color via CSS the way a stroke can, so each
 *  color needs its own predefined arrowhead) — see the `<defs>` block below. */
function edgeMarkerId(reason: ScalingEdgeReason): string {
    if (reason === "combo-ingredient") return "arrow-combo-ingredient";
    if (reason === "combo-result") return "arrow-combo-result";
    return "arrow-default";
}

/** Russian plural form for "N шаг(а/ов) от корня" — 1 шаг, 2-4 шага, 5+/11-14 шагов. */
function stepsWord(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "шаг";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "шага";
    return "шагов";
}

function depthLabel(depth: number): string {
    if (depth === 0) return "Головной предмет";
    return `${depth} ${stepsWord(depth)} от корня`;
}

type TreeNodeProps = {
    node: CascadeLevelNode;
    nodeRefs: React.MutableRefObject<Map<string, HTMLElement>>;
    dimmed: boolean;
    onHoverStart: () => void;
    onHoverEnd: () => void;
    onOpen: (itemId: string) => void;
};

/** A ReplaceItem combination — its ingredients feed in, the result comes out (see ComboInfo). Round, not square
 *  like a real item node, so it reads as a mechanism rather than an item; not a link since there's no item page
 *  for it. The full ingredient→result formula lives in the side panel (see DetailPanel), not the hover tooltip —
 *  the tooltip here is just a one-word label so it never grows large enough to obscure anything. */
function ComboNode({ node, nodeRefs, dimmed, onHoverStart, onHoverEnd }: TreeNodeProps) {
    return (
        <Tooltip title="Комбинация">
            <Box
                ref={(el: HTMLElement | null) => {
                    if (el) nodeRefs.current.set(node.itemId, el);
                    else nodeRefs.current.delete(node.itemId);
                }}
                onMouseEnter={onHoverStart}
                onMouseLeave={onHoverEnd}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    border: "1px dashed",
                    borderColor: "primary.main",
                    bgcolor: "background.paper",
                    opacity: dimmed ? 0.3 : 1,
                    transition: "opacity 0.15s",
                }}
            >
                <Typography sx={{ fontSize: 26 }}>⚗️</Typography>
            </Box>
        </Tooltip>
    );
}

/**
 * One tree node: item icon, name + description in the hover tooltip as before — only the *why* (which parent(s)
 * it feeds into, see ScalingNode) moved out, into the side panel (see DetailPanel). A node can have several
 * parents now (the multi-parent BFS in computeScalingGraph), and that reason list alone could grow a tooltip tall
 * enough to cover the very connections it was explaining, right under the cursor — the side panel stays put next
 * to the graph instead. Registers itself in `nodeRefs` so the parent can measure it for edge lines.
 */
function TreeNode(props: TreeNodeProps) {
    const { node, nodeRefs, dimmed, onHoverStart, onHoverEnd, onOpen } = props;
    const store = useStore();

    if (node.combo) return <ComboNode {...props} />;

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
                onClick={(event) => {
                    // Opens the item as an overlay on top of this build page instead of navigating away —
                    // same "внутреннее окно" pattern GraphPage uses for build nodes (see DetailModal).
                    event.preventDefault();
                    onOpen(node.itemId);
                }}
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

type DetailPanelProps = {
    node: CascadeLevelNode | undefined;
    onOpen: (itemId: string) => void;
};

/**
 * Fixed panel to the right of the graph showing *why* the currently-hovered node is here — name/description stay
 * in the node's own hover tooltip (see TreeNode), only the connection reasons moved here (2026-07-24): a node with
 * several real parents (see the multi-parent BFS in computeScalingGraph) could grow a tooltip tall enough to cover
 * the very connections it was explaining, right under the cursor. A panel that stays in a fixed spot instead of
 * following the mouse doesn't have that problem, and can show as many reason lines as the node actually has.
 */
function DetailPanel({ node, onOpen }: DetailPanelProps) {
    const store = useStore();

    if (!node) {
        return (
            <Typography variant="body2" color="text.secondary">
                Наведите на предмет в дереве, чтобы увидеть, почему он здесь.
            </Typography>
        );
    }

    if (node.combo) {
        const nameOf = (id: string) => {
            const item = store.getItem(id);
            return item ? store.itemName(item) : id;
        };
        return (
            <Stack spacing={1}>
                <Typography variant="subtitle2">Комбинация</Typography>
                <Typography variant="body2" color="text.secondary">
                    {node.combo.ingredientIds.map(nameOf).join(" + ")} → {nameOf(node.combo.resultId)}
                </Typography>
            </Stack>
        );
    }

    const item = store.getItem(node.itemId);
    const name = item ? store.itemName(item) : node.itemId;

    // Why this node is here — every real parent it feeds into, and what kind of connection that is (e.g.
    // "спавнит/заменяет — Маньяк"), not just "connects to root somehow". A node can have more than one now (see
    // computeScalingGraph's multi-parent BFS) — that's exactly what needed room to breathe outside a tooltip.
    const reasonLines = node.parents.map((parent) => {
        const parentItem = store.getItem(parent.itemId);
        const parentName = parentItem ? store.itemName(parentItem) : parent.itemId;
        return `${SCALING_EDGE_REASON_LABELS[parent.reason]} — ${parentName}`;
    });

    return (
        <Stack spacing={1}>
            <Typography
                variant="subtitle2"
                component={RouterLink}
                to={`/items/${encodeURIComponent(node.itemId)}`}
                onClick={(event) => {
                    event.preventDefault();
                    onOpen(node.itemId);
                }}
                sx={{ color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
            >
                {name}
            </Typography>
            {reasonLines.length > 0 && (
                <Stack spacing={0.5}>
                    {reasonLines.map((line) => (
                        <Typography key={line} variant="body2" color="text.secondary">
                            {line}
                        </Typography>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}

/**
 * Depth-grouped top-to-bottom visualization of a build's own scaling structure (see computeCascadeLevels): head
 * item, then each depth reached by BFS outward from it — depth 1 = items with a real, direct structural edge to
 * the root's own payoff (money-scaler, event-producer, spawner, direct booster/activator, recolorer), depth 2 =
 * items feeding into a depth-1 item, and so on. Deeper means a more indirect, weaker lever on the root's score —
 * that's the whole point of grouping by depth instead of by a fixed named category (2026-07-24 redesign,
 * replacing the earlier 7-level model): "чем ниже предмет, тем меньше он скейлит корень, но они могут скейлить
 * другие предметы, которые скейлят корень" (the user's own framing). *Why* a node is connected (spawns, produces
 * the listened-for event, boosts a value, ...) now lives in its hover tooltip instead of naming the row.
 * Members with no real path to the root at all (manually added, from a different auto-build algorithm, or
 * explained only by a combo whose result itself has no path to the root) are listed separately below, not
 * force-assigned to a depth. ReplaceItem combinations (2+ ingredients producing a result, all build members) are
 * synthetic ⚗️ nodes folded directly into this same depth graph (see computeCascadeLevels/placeCombosInGraph) —
 * not a separate section — with orange/green edges (ingredient→combo/combo→result) distinguishing them from the
 * plain blue everything else uses.
 * Connector lines are computed by measuring each node's DOM position (getBoundingClientRect) rather than a
 * layout library — fine at this scale (a build's item count), recomputed via ResizeObserver so image loads and
 * window resizes don't leave stale lines. Each non-root node's `parents` point at the *specific* other member
 * that actually explains it (a spawner points at what it spawns, not at the root) — real provenance.
 */
export default function BuildTree({ build }: Props) {
    const store = useStore();

    const { nodes, unclassified, rootEligible } = useMemo(
        () => computeCascadeLevels(build, store.items, store.mechanics, store.replaceRules),
        [build, store.items, store.mechanics, store.replaceRules]
    );

    // Grouped by depth, ascending — no gap-filling needed (unlike the old fixed 7-level grid): a depth can only
    // be reached at all if the depth before it had real members (BFS), so there's never a legitimate "empty middle
    // row" the way "0 money scalers" was a real result under the old category-based model.
    const depths = useMemo(() => {
        const byDepth = new Map<number, CascadeLevelNode[]>();
        for (const node of nodes) {
            if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
            byDepth.get(node.depth)!.push(node);
        }
        return [...byDepth.entries()].sort(([a], [b]) => a - b);
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
            for (const parent of node.parents) {
                link(node.itemId, parent.itemId);
                link(parent.itemId, node.itemId);
            }
        }
        return map;
    }, [nodes]);

    const nodeRefs = useRef(new Map<string, HTMLElement>());
    const containerRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
    const [openItemId, setOpenItemId] = useState<string | null>(null);

    // store.items/mechanics/etc. are getters that return a fresh array on every access, so `nodes` is a new
    // array reference every render even when its contents are identical — depending the effect on `nodes`
    // itself would re-run (and setEdges) every render forever. This derived string is stable across renders
    // that produce the same actual tree, which is what breaks that loop.
    const nodesKey = nodes
        .map((node) => `${node.itemId}:${node.depth}:${node.parents.map((p) => p.itemId).join(",")}`)
        .join("|");

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

                for (const parent of node.parents) {
                    const parentId = parent.itemId;
                    const parentEl = nodeRefs.current.get(parentId);
                    if (!parentEl) continue;
                    const parentRect = parentEl.getBoundingClientRect();

                    // Connect bottom-of-the-higher-box to top-of-the-lower-box by actual on-screen position (not
                    // by depth) — a shallower node normally renders above a deeper one, but this stays a
                    // defensive position check rather than assuming depth order always matches screen order.
                    const parentIsHigher = parentRect.top + parentRect.height / 2 <= childRect.top + childRect.height / 2;

                    next.push({
                        parentId,
                        childId: node.itemId,
                        reason: parent.reason,
                        x1: parentRect.left + parentRect.width / 2 - containerRect.left,
                        y1: (parentIsHigher ? parentRect.bottom : parentRect.top) - containerRect.top,
                        x2: childRect.left + childRect.width / 2 - containerRect.left,
                        y2: (parentIsHigher ? childRect.top : childRect.bottom) - containerRect.top,
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

    const hoveredNode = hoveredItemId ? nodes.find((node) => node.itemId === hoveredItemId) : undefined;

    if (build.items.length === 0) return null;

    return (
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ alignItems: "flex-start" }}>
            <Paper sx={{ p: 3, flex: 1, minWidth: 0 }}>
                {/* zIndex here (not just position:relative) matters: it makes this box its own stacking context, so
                    the edges SVG's negative z-index below stays contained to "behind the node boxes in here" instead
                    of escaping to the nearest ancestor stacking context and rendering behind unrelated page content
                    (e.g. a Paper/Card background), which is what made the edges disappear entirely without it. */}
                <Box ref={containerRef} sx={{ position: "relative", zIndex: 0 }}>
                    <Box
                        component="svg"
                        sx={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            pointerEvents: "none",
                            // Negative z-index, not just declaration order: a position:absolute element with
                            // z-index:auto/0 paints AFTER (on top of) non-positioned in-flow content regardless of
                            // DOM order (CSS2.1 painting order) — without this, the invisible wide hit-stroke used
                            // for edge hover (below) would sit visually above the node boxes wherever an edge's
                            // endpoint touches one, stealing hover from the node it's connected to.
                            zIndex: -1,
                        }}
                    >
                        {/* One arrowhead marker per edge color (see edgeMarkerId) — SVG markers can't take a
                            dynamic stroke-linked color, so each color gets its own predefined marker referenced
                            by id. Placed at the *parent* end of each line: a node's `parents` are what it feeds
                            into (see ScalingNode/CascadeLevelNode), so the arrow points from the specific item a
                            connection came from toward the specific item it explains — not just a plain
                            undirected line between two boxes. */}
                        <defs>
                            {(["arrow-default", "arrow-combo-ingredient", "arrow-combo-result"] as const).map((id) => (
                                <marker
                                    key={id}
                                    id={id}
                                    viewBox="0 0 10 10"
                                    refX="8.5"
                                    refY="5"
                                    markerWidth="7"
                                    markerHeight="7"
                                    markerUnits="userSpaceOnUse"
                                    orient="auto-start-reverse"
                                >
                                    <path
                                        d="M0,0 L10,5 L0,10 Z"
                                        fill={
                                            id === "arrow-combo-ingredient"
                                                ? edgeColor("combo-ingredient")
                                                : id === "arrow-combo-result"
                                                  ? edgeColor("combo-result")
                                                  : DEFAULT_EDGE_COLOR
                                        }
                                    />
                                </marker>
                            ))}
                        </defs>

                        {edges.map((edge) => {
                            const key = edgeKey(edge.parentId, edge.childId);
                            const isHighlighted = !highlightedEdgeKeys || highlightedEdgeKeys.has(key);
                            const opacity = isHighlighted ? 0.9 : 0.15;
                            return (
                                <g key={key}>
                                    {/* Drawn from child to parent (reversed from x1/y1->x2/y2) so the marker-end
                                        arrowhead lands on the parent — the item this connection explains — with
                                        the tip pointing at exactly who it came from. */}
                                    <line
                                        x1={edge.x2}
                                        y1={edge.y2}
                                        x2={edge.x1}
                                        y2={edge.y1}
                                        stroke={edgeColor(edge.reason)}
                                        strokeWidth={isHighlighted ? 2.5 : 1.5}
                                        opacity={opacity}
                                        markerEnd={`url(#${edgeMarkerId(edge.reason)})`}
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
                        {depths.map(([depth, depthNodes]) => (
                            <Box key={depth}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                    {depthLabel(depth)}
                                </Typography>
                                <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
                                    {depthNodes.map((node) => (
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
                                            onOpen={setOpenItemId}
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </Box>

                {unclassified.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                        <Typography variant="caption" color="text.secondary">
                            {rootEligible
                                ? "Не объясняется ни одним из уровней генерации:"
                                : "Головной предмет не приносит очки игрока — уровни генерации неприменимы:"}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mt: 1 }}>
                            {unclassified.map((id) => {
                                const item = store.getItem(id);
                                return (
                                    <Chip
                                        key={id}
                                        component={RouterLink}
                                        to={`/items/${encodeURIComponent(id)}`}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            setOpenItemId(id);
                                        }}
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
            </Paper>

            <Paper
                variant="outlined"
                sx={{
                    p: 2,
                    width: { xs: "100%", md: 320 },
                    flexShrink: 0,
                    position: { md: "sticky" },
                    top: { md: 16 },
                }}
            >
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Почему предмет здесь
                </Typography>
                <DetailPanel node={hoveredNode} onOpen={setOpenItemId} />
            </Paper>

            <DetailModal open={openItemId !== null} onClose={() => setOpenItemId(null)}>
                {openItemId && <ItemDetailPage id={openItemId} />}
            </DetailModal>
        </Stack>
    );
}
