import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useStore } from "../hooks/useStore";
import ItemIcon from "./ItemIcon";
import ItemDescription from "./ItemDescription";
import DetailModal from "./DetailModal";
import ItemDetailPage from "../pages/Items/ItemDetailPage";
import {
    computeCascadeLevels,
    computeUpgradeTierIds,
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

    /** Quadratic-bezier control point. Sits exactly on the (x1,y1)-(x2,y2) chord's midpoint — i.e. renders as a
     *  straight line — unless the edge needed to bow: see computeControlPoint. */
    cx: number;
    cy: number;
};

type Point = { x: number; y: number };

/** Includes `reason` (not just the pair of ids) — the same two items can now be connected by more than one real
 *  edge at once (e.g. both a money-scaler *and* a modifier connection), since a node keeps every real parent it
 *  finds rather than just the first (see computeScalingGraphInternal's multi-parent BFS). Without `reason` here,
 *  two such edges collided on the same React key. `parentId`/`childId` still come first so `.split("--")` callers
 *  that only destructure the first two parts (see highlightedItemIds) keep working unchanged. */
function edgeKey(parentId: string, childId: string, reason: ScalingEdgeReason): string {
    return `${parentId}--${childId}--${reason}`;
}

const DEFAULT_EDGE_COLOR = "#5B8CFF";

/** Distinct from combo orange (#ffb74d) on purpose — a "context" node (see addRelatedContextNodes) and a combo
 *  ingredient answer different questions ("what else reacts to this" vs. "what this combines with"), so they get
 *  visually distinguishable oranges rather than reusing the exact same one. */
const EXTRA_NODE_COLOR = "#ff9800";

/** Orange into a combo (ingredient feeding it), green out of one (the combo producing its result) — same colors
 *  the old, since-removed buildTree.ts used — everything else is plain blue. Known directly from the edge's own
 *  `reason` now (combo-ingredient/combo-result), no separate combo lookup needed. */
function edgeColor(reason: ScalingEdgeReason): string {
    if (reason === "combo-ingredient") return "#ffb74d";
    if (reason === "combo-result") return "#66bb6a";
    if (reason === "related") return EXTRA_NODE_COLOR;
    return DEFAULT_EDGE_COLOR;
}

/** One <marker> id per edge color (SVG markers can't take a dynamic color via CSS the way a stroke can, so each
 *  color needs its own predefined arrowhead) — see the `<defs>` block below. */
function edgeMarkerId(reason: ScalingEdgeReason): string {
    if (reason === "combo-ingredient") return "arrow-combo-ingredient";
    if (reason === "combo-result") return "arrow-combo-result";
    if (reason === "related") return "arrow-related";
    return "arrow-default";
}

/** Below this |y2-y1|, an edge connects two nodes in (effectively) the same tier row rather than adjacent rows —
 *  happens for a combo's "additional parent" link when it lands on the same depth as the participant it's linking
 *  to. A straight line here would run right along the row instead of connecting two boxes vertically, so it always
 *  gets bowed off the row instead of measured for obstruction. */
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
 *     happens whenever a depth has exactly one node, so every node in that column ends up centered on the same x —
 *     a longer edge skipping past an intervening depth then draws straight through that depth's node (and through
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
    onHoverStart: (itemId: string) => void;
    onHoverEnd: (itemId: string) => void;
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
                onMouseEnter={() => onHoverStart(node.itemId)}
                onMouseLeave={() => onHoverEnd(node.itemId)}
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

// Memoized — see MemoTreeNode's own comment below for why (same reasoning, just far fewer combo nodes in
// practice than real ones).
const MemoComboNode = memo(ComboNode);

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

    if (node.combo) return <MemoComboNode {...props} />;

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
                onMouseEnter={() => onHoverStart(node.itemId)}
                onMouseLeave={() => onHoverEnd(node.itemId)}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    p: 1,
                    width: 56,
                    height: 56,
                    borderRadius: 2,
                    border: node.extra ? "2px solid" : "1px solid",
                    borderColor: node.extra ? EXTRA_NODE_COLOR : "divider",
                    textDecoration: "none",
                    color: "inherit",
                    bgcolor: node.extra ? alpha(EXTRA_NODE_COLOR, 0.14) : "background.paper",
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

// Memoized: with ~200+ nodes on screen, hovering any single one otherwise re-renders every other node too (only
// its `dimmed` prop actually changes) — memo plus the itemId-parameterized onHoverStart/onHoverEnd it receives
// (stable across BuildTree renders via useCallback, unlike a fresh per-node closure) means only nodes whose own
// dimmed value actually flips re-render, instead of the whole tree on every hover.
const MemoTreeNode = memo(TreeNode);

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
            {node.extra && (
                <Typography variant="caption" sx={{ color: EXTRA_NODE_COLOR, fontWeight: 600 }}>
                    Доп. контекст — не входит в билд
                </Typography>
            )}
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

    // Excludes upgrade tiers (+/++) from the graph entirely — a tier is a power-scaled clone of its base item, so
    // letting it independently show up as a lever or a context node just duplicates the base rather than adding
    // real information. Both signals (registered CardUpgrades chain membership, and a translated name ending in
    // "+"/"++" for tiers that were never registered — see computeUpgradeTierIds) are needed: some real tiers in
    // this game's data (e.g. numbered ..._2/_3 ids) are only distinguishable by their display name, not by chain.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store.itemName is a stable method on the singleton
    const resolveName = useCallback((item: Parameters<typeof store.itemName>[0]) => store.itemName(item), []);
    const excludedTierIds = useMemo(
        () => computeUpgradeTierIds(store.items, store.upgradeChains, resolveName),
        [store.items, store.upgradeChains, resolveName]
    );
    const generationItems = useMemo(
        () => store.items.filter((item) => !excludedTierIds.has(item.id)),
        [store.items, excludedTierIds]
    );
    const generationMechanics = useMemo(
        () => store.mechanics.filter((mechanic) => !excludedTierIds.has(mechanic.itemId)),
        [store.mechanics, excludedTierIds]
    );

    const { nodes, unclassified, rootEligible } = useMemo(
        () =>
            computeCascadeLevels(build, generationItems, generationMechanics, store.replaceRules, false, {
                upgradeChains: store.upgradeChains,
                includeRelatedContext: true,
            }),
        [build, generationItems, generationMechanics, store.replaceRules, store.upgradeChains]
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

    // Stable across every BuildTree render (deps are empty — both only use the setState functions, which React
    // itself guarantees are stable) so MemoTreeNode's memo comparison isn't defeated by a fresh closure every
    // render — see MemoTreeNode's own comment for why that matters at ~200 nodes.
    const handleHoverStart = useCallback((itemId: string) => {
        setHoveredItemId(itemId);
        setHoveredEdgeKey(null);
    }, []);
    const handleHoverEnd = useCallback((itemId: string) => {
        setHoveredItemId((current) => (current === itemId ? null : current));
    }, []);

    // Depending the effect below directly on `nodes` would be fragile: `computeCascadeLevels` is a plain
    // function call inside a useMemo, not something guaranteed to return the same array/object identities forever
    // as this file evolves, and a reference that ever changed without the actual tree changing would re-run the
    // effect (and setEdges) every render forever. This derived string only changes when the tree's actual shape
    // does, which is what keeps that loop from happening regardless of `nodes`' own reference stability.
    const nodesKey = nodes
        .map((node) => `${node.itemId}:${node.depth}:${node.parents.map((p) => p.itemId).join(",")}`)
        .join("|");

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const computeEdges = () => {
            const containerRect = container.getBoundingClientRect();

            // Every placed node's box in container-relative coordinates — used both as edge endpoints above and,
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

                for (const parent of node.parents) {
                    const parentId = parent.itemId;
                    const parentEl = nodeRefs.current.get(parentId);
                    if (!parentEl) continue;
                    const parentRect = parentEl.getBoundingClientRect();

                    // Connect bottom-of-the-higher-box to top-of-the-lower-box by actual on-screen position (not
                    // by depth) — a shallower node normally renders above a deeper one, but this stays a
                    // defensive position check rather than assuming depth order always matches screen order.
                    const parentIsHigher = parentRect.top + parentRect.height / 2 <= childRect.top + childRect.height / 2;

                    raw.push({
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
                    .map((edge) => edgeKey(edge.parentId, edge.childId, edge.reason))
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
                            {(
                                ["arrow-default", "arrow-combo-ingredient", "arrow-combo-result", "arrow-related"] as const
                            ).map((id) => (
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
                                                  : id === "arrow-related"
                                                    ? edgeColor("related")
                                                    : DEFAULT_EDGE_COLOR
                                        }
                                    />
                                </marker>
                            ))}
                        </defs>

                        {edges.map((edge) => {
                            const key = edgeKey(edge.parentId, edge.childId, edge.reason);
                            const isHighlighted = !highlightedEdgeKeys || highlightedEdgeKeys.has(key);
                            const opacity = isHighlighted ? 0.9 : 0.15;
                            // A quadratic bezier through the control point — degenerates to a plain straight
                            // segment when the control point sits on the chord's own midpoint (the common case;
                            // see computeControlPoint), and bows around same-tier/obstructed edges otherwise.
                            // Every other reason is drawn child->parent so the arrowhead lands on the parent —
                            // the item this connection explains, with the tip pointing at exactly who it came
                            // from (e.g. "spawner" points at what it spawns). A "related" edge reads the other
                            // way round: the anchor (parent) is the real item already in the graph, and the
                            // child is the *other*, merely context item it's related to — the anchor is what
                            // does the influencing (e.g. Маньяк killing), and the child is what's affected
                            // (Медсестра reacting to it), so the arrow points parent->child instead, same as
                            // every solid edge reads "arrow points at what's influenced".
                            const [startX, startY, endX, endY] =
                                edge.reason === "related"
                                    ? [edge.x1, edge.y1, edge.x2, edge.y2]
                                    : [edge.x2, edge.y2, edge.x1, edge.y1];
                            const path = `M ${startX} ${startY} Q ${edge.cx} ${edge.cy} ${endX} ${endY}`;
                            const hitPath = `M ${edge.x1} ${edge.y1} Q ${edge.cx} ${edge.cy} ${edge.x2} ${edge.y2}`;
                            return (
                                <g key={key}>
                                    <path
                                        d={path}
                                        fill="none"
                                        stroke={edgeColor(edge.reason)}
                                        strokeWidth={isHighlighted ? 2.5 : 1.5}
                                        strokeDasharray={edge.reason === "related" ? "5 4" : undefined}
                                        opacity={opacity}
                                        markerEnd={`url(#${edgeMarkerId(edge.reason)})`}
                                        style={{ pointerEvents: "none", transition: "opacity 0.15s" }}
                                    />
                                    {/* Wider invisible path on top, just for a comfortable hover hit-area on a 1.5px line. */}
                                    <path
                                        d={hitPath}
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
                        {depths.map(([depth, depthNodes]) => (
                            <Box key={depth}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                    {depthLabel(depth)}
                                </Typography>
                                <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
                                    {depthNodes.map((node) => (
                                        <MemoTreeNode
                                            key={node.itemId}
                                            node={node}
                                            nodeRefs={nodeRefs}
                                            dimmed={highlightedItemIds !== null && !highlightedItemIds.has(node.itemId)}
                                            onHoverStart={handleHoverStart}
                                            onHoverEnd={handleHoverEnd}
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
