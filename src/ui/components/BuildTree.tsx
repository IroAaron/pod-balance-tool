import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { useStore } from "../hooks/useStore";
import ItemIcon from "./ItemIcon";
import ItemDescription from "./ItemDescription";
import DetailModal from "./DetailModal";
import ItemDetailPage from "../pages/Items/ItemDetailPage";
import { computeBuildTree, type BuildTreeNode, type ComboInfo } from "../../core/domain/buildTree";
import type { Build } from "../../core/models/Build";

type Props = {
    build: Build;
};

type Edge = {
    parentId: string;
    childId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;

    /** Quadratic-bezier control point. Sits exactly on the (x1,y1)-(x2,y2) chord's midpoint — i.e. renders as a
     *  straight line — unless the edge needed to bow: see computeControlPoint. */
    cx: number;
    cy: number;
};

type Point = { x: number; y: number };

interface ComboEdgeInfo {
    color: string;

    /** Where the arrowhead's tip sits — the boundary of whichever real node it's pointing at. */
    tip: Point;

    /** Direction the arrow points, in radians (atan2 convention). */
    angle: number;
}

/**
 * Orange for an ingredient feeding a combo (arrow points at the combo), green for the combo's own result coming
 * out of it (arrow points at the result) — by the combo's actual ingredient/result roles, not by which side the
 * tree's BFS happened to record as "parent"/"child". That distinction matters for the arrow direction specifically
 * (not just the color): when a combo's result is the tree's own root (a common case — the combo is often exactly
 * why the root exists), the root is discovered *before* its ingredients and ends up as the BFS parent of the combo
 * node — i.e. the line is drawn root-to-combo — even though the arrow still needs to point combo-to-root, since
 * that's the real direction of "this combination produces the root", not the other way around.
 */
function comboEdgeInfo(edge: Edge, comboInfoById: Map<string, ComboInfo>): ComboEdgeInfo | null {
    const parentCombo = comboInfoById.get(edge.parentId);
    const childCombo = comboInfoById.get(edge.childId);
    const combo = parentCombo ?? childCombo;
    if (!combo) return null;

    const comboIsParent = Boolean(parentCombo);
    const comboPoint: Point = comboIsParent ? { x: edge.x1, y: edge.y1 } : { x: edge.x2, y: edge.y2 };
    const otherPoint: Point = comboIsParent ? { x: edge.x2, y: edge.y2 } : { x: edge.x1, y: edge.y1 };
    const otherId = comboIsParent ? edge.childId : edge.parentId;

    // Tangent direction at a bezier endpoint, measured from the shared control point rather than the other
    // endpoint — for a straight (unbowed) edge the control point sits on the chord, so this reduces to exactly
    // the old point-to-point angle; for a bowed edge it correctly follows the curve instead of cutting the corner.
    const angleFromControl = (point: Point) => Math.atan2(point.y - edge.cy, point.x - edge.cx);

    if (otherId === combo.resultId) {
        return { color: "#66bb6a", tip: otherPoint, angle: angleFromControl(otherPoint) };
    }
    if (combo.ingredientIds.includes(otherId)) {
        return { color: "#ffb74d", tip: comboPoint, angle: angleFromControl(comboPoint) };
    }
    return null;
}

/** A small filled triangle, tip at `info.tip`, pointing along `info.angle` — two more points at ±spread from the
 *  tip, `size` back along the line, is the standard construction for an SVG arrowhead. */
function ArrowHead({ info, opacity }: { info: ComboEdgeInfo; opacity: number }) {
    const size = 12;
    const spread = Math.PI / 7;

    const wing = (offset: number) => ({
        x: info.tip.x - size * Math.cos(info.angle + offset),
        y: info.tip.y - size * Math.sin(info.angle + offset),
    });
    const wing1 = wing(spread);
    const wing2 = wing(-spread);

    const points = [`${info.tip.x},${info.tip.y}`, `${wing1.x},${wing1.y}`, `${wing2.x},${wing2.y}`].join(" ");

    return <polygon points={points} fill={info.color} opacity={opacity} style={{ transition: "opacity 0.15s" }} />;
}

function edgeKey(parentId: string, childId: string): string {
    return `${parentId}--${childId}`;
}

/** Below this |y2-y1|, an edge connects two nodes in (effectively) the same tier row rather than adjacent rows —
 *  happens for a combo's "additional parent" link (see computeBuildTree) when it lands on the same tier as the
 *  participant it's linking to. A straight line here would run right along the row instead of connecting two
 *  boxes vertically, so it always gets bowed off the row instead of measured for obstruction. */
const SAME_TIER_Y_THRESHOLD = 24;

/** How far a same-tier edge bows off the row. Small and fixed — there's no obstruction to clear, just enough
 *  curve to read as "not part of the row" and to keep two same-tier edges from sitting on the same line. */
const SAME_TIER_BOW = 22;

/** Margin added around a node's own half-width when checking whether a straight edge would cut through it. */
const OBSTRUCTION_MARGIN = 10;

/** Ceiling on a computed obstruction-clearing bow — guards against a huge/unstable value when the obstruction
 *  sits very close to one of the edge's own endpoints (where the bezier's deviation-per-bow-unit is tiny). */
const MAX_OBSTRUCTION_BOW = 160;

/** A same-tier edge is never more than this far off-center before its own position (not the fallback counter)
 *  decides which way it bows; an obstruction edge uses the same tolerance against the diagram's horizontal
 *  center. Small — mainly there so genuinely-centered edges don't flip sign on sub-pixel layout noise. */
const CENTER_EPSILON = 4;

/**
 * Picks which side of the chord to bow the control point to, so the whole diagram reads as bowing outward from
 * its own center — mirror-symmetric — rather than each edge picking a side at random:
 *   - if the edge's own position is clearly off-center along the relevant axis (its tier's row for a same-tier
 *     edge, the diagram's horizontal middle for an obstruction edge), it bows further *away* from center;
 *   - only when it's genuinely centered (no positional signal to go on — the single-item-per-tier case that
 *     motivated this whole feature) does it fall back to alternating with the next edge that's just as centered,
 *     so two edges through the same spot still end up mirrored either side instead of both picking the same way.
 * `desiredDir` is the "positive" reference axis (down for a same-tier bow, right for an obstruction bow) —
 * `dot(perp, ±desiredDir)` then finds whichever sign of *this edge's own* perpendicular actually points that way,
 * since perp's sign flips depending on which of the edge's two endpoints happens to be x1/x2 vs y1/y2.
 */
function chooseBowSign(
    offsetFromCenter: number,
    perp: Point,
    desiredDir: Point,
    fallbackCounter: { value: number }
): 1 | -1 {
    let awayFromCenter: boolean;
    if (Math.abs(offsetFromCenter) > CENTER_EPSILON) {
        awayFromCenter = offsetFromCenter > 0;
    } else {
        awayFromCenter = fallbackCounter.value % 2 === 0;
        fallbackCounter.value += 1;
    }
    const desired = awayFromCenter ? desiredDir : { x: -desiredDir.x, y: -desiredDir.y };
    return perp.x * desired.x + perp.y * desired.y >= 0 ? 1 : -1;
}

/**
 * Computes each edge's bezier control point. Defaults to the (x1,y1)-(x2,y2) chord's own midpoint, which renders
 * as a plain straight line — bowed off that midpoint only when needed:
 *   - the edge connects two same-tier nodes (see SAME_TIER_Y_THRESHOLD), or
 *   - the straight chord would cut through some OTHER node's box that isn't this edge's own parent/child. This
 *     happens whenever a tier has exactly one node, so every node in the tree ends up centered on the same x —
 *     a longer edge skipping past an intervening tier then draws straight through that tier's node (and through
 *     the shorter edges touching it), which is exactly the "arrows fully overlap" case this exists to fix.
 * The bow amount for the obstruction case is solved from the actual quadratic-bezier deviation at the
 * obstruction's own position along the curve (not a flat constant) so it reliably clears the box regardless of
 * how far along the edge that obstruction sits.
 */
function computeControlPoint(
    edge: Pick<Edge, "parentId" | "childId" | "x1" | "y1" | "x2" | "y2">,
    nodeBoxes: Map<string, { cx: number; cy: number; halfW: number }>,
    center: Point,
    fallbackCounters: { horizontal: { value: number }; vertical: { value: number } }
): Point {
    const midX = (edge.x1 + edge.x2) / 2;
    const midY = (edge.y1 + edge.y2) / 2;
    const dx = edge.x2 - edge.x1;
    const dy = edge.y2 - edge.y1;
    const length = Math.hypot(dx, dy) || 1;
    // Unit vector perpendicular to the (dx,dy) chord — for a near-horizontal chord this is near-vertical (bows
    // the row edge up/down) and for a near-vertical chord it's near-horizontal (bows an obstructed edge sideways).
    const perpX = -dy / length;
    const perpY = dx / length;

    if (Math.abs(dy) < SAME_TIER_Y_THRESHOLD) {
        // Bows away from the diagram's vertical center: a same-tier edge in the top half arcs further up, one in
        // the bottom half arcs further down — reads as radiating outward instead of an arbitrary per-edge choice.
        const sign = chooseBowSign(midY - center.y, { x: perpX, y: perpY }, { x: 0, y: 1 }, fallbackCounters.horizontal);
        return { x: midX + perpX * SAME_TIER_BOW * sign, y: midY + perpY * SAME_TIER_BOW * sign };
    }

    const minY = Math.min(edge.y1, edge.y2);
    const maxY = Math.max(edge.y1, edge.y2);
    let neededBow = 0;
    for (const [id, box] of nodeBoxes) {
        if (id === edge.parentId || id === edge.childId) continue;
        if (box.cy <= minY + OBSTRUCTION_MARGIN || box.cy >= maxY - OBSTRUCTION_MARGIN) continue;

        const t = (box.cy - edge.y1) / dy;
        const lineX = edge.x1 + t * dx;
        const clearanceNeeded = box.halfW + OBSTRUCTION_MARGIN;
        if (Math.abs(lineX - box.cx) >= clearanceNeeded) continue;

        // Quadratic-bezier deviation from the straight chord at parameter t is 2*t*(1-t) times the control
        // point's own offset — solve backwards for the offset that puts the curve exactly clearanceNeeded away.
        const factor = Math.max(2 * t * (1 - t), 0.08);
        neededBow = Math.max(neededBow, Math.min(clearanceNeeded / factor, MAX_OBSTRUCTION_BOW));
    }

    if (neededBow === 0) return { x: midX, y: midY };
    // Bows away from the diagram's horizontal center, same idea as the same-tier case but on the other axis.
    const sign = chooseBowSign(midX - center.x, { x: perpX, y: perpY }, { x: 1, y: 0 }, fallbackCounters.vertical);
    return { x: midX + perpX * neededBow * sign, y: midY + perpY * neededBow * sign };
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
    onOpen: (itemId: string) => void;
};

/** A ReplaceItem combination — its ingredients feed in, the result comes out. Round (not square, unlike a real
 *  item node) so it reads as a mechanism rather than an item, and not a link since there's no item page for it. */
function ComboNode({ node, nodeRefs, dimmed, onHoverStart, onHoverEnd }: TreeNodeProps) {
    const store = useStore();
    const combo = node.combo!;

    const nameOf = (id: string) => {
        const item = store.getItem(id);
        return item ? store.itemName(item) : id;
    };

    return (
        <Tooltip
            title={
                <>
                    Комбинация
                    <br />
                    {combo.ingredientIds.map(nameOf).join(" + ")} → {nameOf(combo.resultId)}
                </>
            }
        >
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

/** One tree node: item icon only (name/description live in the hover tooltip), registers itself in `nodeRefs`
 *  so the parent can measure it for edge lines. */
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

/** Placeholder for a tier with no members — keeps the step sequence visible instead of skipping straight to the
 *  next non-empty tier. Not a real node: no link, no tooltip, no edges drawn to/from it. */
function EmptyTierSlot() {
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 56,
                height: 56,
                borderRadius: 2,
                border: "1px dashed",
                borderColor: "divider",
                color: "text.disabled",
            }}
        >
            <Typography variant="caption">—</Typography>
        </Box>
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

    const comboInfoById = useMemo(() => {
        const map = new Map<string, ComboInfo>();
        for (const node of nodes) {
            if (node.combo) map.set(node.itemId, node.combo);
        }
        return map;
    }, [nodes]);

    // Every tier number up to the highest one actually reached gets a row, even if nothing landed on it (e.g. no
    // Card-type direct connection at tier 1 but a House/Artefact one at tier 2) — an empty placeholder slot keeps
    // the step sequence visually consistent instead of silently jumping from "Головной предмет" to "2 ступень".
    const tiers = useMemo(() => {
        const byTier = new Map<number, BuildTreeNode[]>();
        let maxTier = 0;
        for (const node of nodes) {
            if (!byTier.has(node.tier)) byTier.set(node.tier, []);
            byTier.get(node.tier)!.push(node);
            maxTier = Math.max(maxTier, node.tier);
        }
        const result: [number, BuildTreeNode[]][] = [];
        for (let tier = 0; tier <= maxTier; tier++) {
            result.push([tier, byTier.get(tier) ?? []]);
        }
        return result;
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
    const [openItemId, setOpenItemId] = useState<string | null>(null);

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

            // Every placed node's box in container-relative coordinates — used both as edge endpoints below and,
            // in computeControlPoint, to detect a straight edge cutting through some unrelated node.
            const nodeBoxes = new Map<string, { cx: number; cy: number; halfW: number }>();
            for (const [id, el] of nodeRefs.current) {
                const rect = el.getBoundingClientRect();
                nodeBoxes.set(id, {
                    cx: rect.left + rect.width / 2 - containerRect.left,
                    cy: rect.top + rect.height / 2 - containerRect.top,
                    halfW: rect.width / 2,
                });
            }

            const raw: Omit<Edge, "cx" | "cy">[] = [];

            for (const node of nodes) {
                const childEl = nodeRefs.current.get(node.itemId);
                if (!childEl) continue;
                const childRect = childEl.getBoundingClientRect();

                for (const parentId of node.parents) {
                    const parentEl = nodeRefs.current.get(parentId);
                    if (!parentEl) continue;
                    const parentRect = parentEl.getBoundingClientRect();

                    // "Parent" doesn't reliably mean "the one visually above" — a combo participant can end up at
                    // an earlier tier than the combo itself (placed there via a different, more direct signal;
                    // see computeBuildTree's post-pass), so the combo's own edge to it points *upward*. Always
                    // connect bottom-of-the-higher-box to top-of-the-lower-box (by actual on-screen position, not
                    // by tier/parent role) — otherwise the line/arrowhead reaches for the wrong side of a box and
                    // ends up geometrically behind it, invisible under the node's own (now higher z-index) fill.
                    const parentIsHigher = parentRect.top + parentRect.height / 2 <= childRect.top + childRect.height / 2;

                    raw.push({
                        parentId,
                        childId: node.itemId,
                        x1: parentRect.left + parentRect.width / 2 - containerRect.left,
                        y1: (parentIsHigher ? parentRect.bottom : parentRect.top) - containerRect.top,
                        x2: childRect.left + childRect.width / 2 - containerRect.left,
                        y2: (parentIsHigher ? childRect.top : childRect.bottom) - containerRect.top,
                    });
                }
            }

            const center: Point = { x: containerRect.width / 2, y: containerRect.height / 2 };
            // Fresh per recompute, shared across the edges below so two edges that both land on the ambiguous
            // (genuinely-centered) fallback still alternate sides against each other, not just against themselves.
            const fallbackCounters = { horizontal: { value: 0 }, vertical: { value: 0 } };
            const next: Edge[] = raw.map((edge) => {
                const control = computeControlPoint(edge, nodeBoxes, center, fallbackCounters);
                return { ...edge, cx: control.x, cy: control.y };
            });

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
                    {edges.map((edge) => {
                        const key = edgeKey(edge.parentId, edge.childId);
                        const isHighlighted = !highlightedEdgeKeys || highlightedEdgeKeys.has(key);
                        const combo = comboEdgeInfo(edge, comboInfoById);
                        const opacity = isHighlighted ? 0.9 : 0.15;
                        // A quadratic bezier through the control point — degenerates to a plain straight segment
                        // when the control point sits on the chord's own midpoint (the common case; see
                        // computeControlPoint), and bows around same-tier/obstructed edges otherwise.
                        const path = `M ${edge.x1} ${edge.y1} Q ${edge.cx} ${edge.cy} ${edge.x2} ${edge.y2}`;
                        return (
                            <g key={key}>
                                <path
                                    d={path}
                                    fill="none"
                                    stroke={combo?.color ?? "#5B8CFF"}
                                    strokeWidth={isHighlighted ? 2.5 : 1.5}
                                    opacity={opacity}
                                    style={{ pointerEvents: "none", transition: "opacity 0.15s" }}
                                />
                                {combo && <ArrowHead info={combo} opacity={opacity} />}
                                {/* Wider invisible path on top, just for a comfortable hover hit-area on a 1.5px line. */}
                                <path
                                    d={path}
                                    fill="none"
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
                                {tierNodes.length === 0 ? (
                                    <EmptyTierSlot />
                                ) : (
                                    tierNodes.map((node) => (
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
                                    ))
                                )}
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

            <DetailModal open={openItemId !== null} onClose={() => setOpenItemId(null)}>
                {openItemId && <ItemDetailPage id={openItemId} />}
            </DetailModal>
        </Box>
    );
}
