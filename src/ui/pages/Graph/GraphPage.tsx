import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
    Box,
    Checkbox,
    FormControl,
    FormControlLabel,
    ListItemText,
    MenuItem,
    Select,
    type SelectChangeEvent,
    Stack,
    Typography,
} from "@mui/material";
import ForceGraph2D from "react-force-graph-2d";
import { useStore } from "../../hooks/useStore";
import { computeBuildConnections } from "../../../core/domain/relations";
import { resolveBuildIcon, type ResolvedBuildIcon } from "../../../core/domain/sprites";
import DetailModal from "../../components/DetailModal";
import BuildDetailPage from "../Builds/BuildDetailPage";

const NODE_RADIUS = 9;

/** Deliberately hardcoded, same precedent/reasoning as BuildsPage's BUILD_TYPE_OPTIONS — these three are the only
 *  real item categories (see normalize.ts's ITEM_CATEGORY_HINTS), not sourced from store.paramValues.ItemType
 *  (which also aggregates unrelated mechanic TargetType/BonusTargetType values). */
const ITEM_TYPE_OPTIONS = ["Card", "House", "Artefact"];

interface BuildNode {
    id: string;

    icon: ResolvedBuildIcon;

    name: string;
}

/**
 * Canvas can't use React's <img onError> the way ItemIcon/BuildIcon do, so node sprites need their own
 * Image() loading + failure cache — this keeps both alive across renders (module-level would leak across
 * unrelated GraphPage mounts sharing unrelated data, so it's created once per component instance via useRef
 * instead). onLoaded is called once a requested sprite finishes loading (success or failure) so the caller can
 * trigger a repaint — react-force-graph-2d's own render loop usually picks up the change on its next animation
 * frame regardless, but forcing one guarantees the newly-loaded sprite doesn't wait for unrelated interaction.
 */
function getCachedSprite(
    cache: Map<string, HTMLImageElement>,
    failed: Set<string>,
    path: string,
    onLoaded: () => void
): HTMLImageElement | undefined {
    const cached = cache.get(path);
    if (cached) return cached;
    if (failed.has(path)) return undefined;

    const img = new Image();
    img.onload = onLoaded;
    img.onerror = () => {
        failed.add(path);
        cache.delete(path);
        onLoaded();
    };
    img.src = path;
    cache.set(path, img);
    return img;
}

interface BuildLink {
    source: string;

    target: string;

    strength: number;

    manual: boolean;
}

/** react-force-graph mutates link.source/target from a plain id string into the actual node object once the
 *  simulation starts — this normalizes either shape back to a plain id, for hover-highlight bookkeeping. */
function linkEndpointId(endpoint: unknown): string {
    if (typeof endpoint === "string") return endpoint;
    if (endpoint && typeof endpoint === "object" && "id" in endpoint) return String((endpoint as { id: unknown }).id);
    return String(endpoint);
}

function linkKey(link: { source: unknown; target: unknown }): string {
    return `${linkEndpointId(link.source)}--${linkEndpointId(link.target)}`;
}

/** Red (weak) -> green (strong) gradient for computed link strength (0..1) — thickness already encodes strength
 *  via linkWidth, this adds a second, faster-to-read cue on top of it. Alpha still scales with strength too, kept
 *  from the pre-gradient version, so weak links stay faint as well as red rather than a fully-opaque red line. */
function linkStrengthColor(strength: number): string {
    const t = Math.max(0, Math.min(1, strength));
    const r = Math.round(229 + t * (76 - 229));
    const g = Math.round(57 + t * (175 - 57));
    const b = Math.round(53 + t * (80 - 53));
    const alpha = 0.35 + t * 0.5;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function GraphPage() {
    const store = useStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });
    const [showLabels, setShowLabels] = useState(false);
    const [typeFilter, setTypeFilter] = useState<string[]>(ITEM_TYPE_OPTIONS);
    const [openBuildId, setOpenBuildId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
    // react-force-graph-2d fires onNodeHover/onLinkHover as two independent callbacks per hit-test frame — a
    // synchronous ref (not state, which only settles after render) is what lets onLinkHover reliably check "is a
    // node hovered right now" regardless of which callback the library happens to invoke first that frame.
    const hoveredNodeRef = useRef<string | null>(null);
    const spriteCacheRef = useRef(new Map<string, HTMLImageElement>());
    const failedSpritesRef = useRef(new Set<string>());
    const [, repaintOnSpriteLoad] = useReducer((count: number) => count + 1, 0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setSize({
                    width: Math.max(entry.contentRect.width, 200),
                    height: Math.max(entry.contentRect.height, 400),
                });
            }
        });

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const graphData = useMemo(() => {
        const connections = computeBuildConnections(
            store.builds,
            store.items,
            store.mechanics,
            store.upgradeChains,
            store.replaceRules
        );

        // Same "type of the first/root item" convention as BuildsPage's own type filter — a build with no
        // determinable root type (empty build) is never hidden by this filter, only builds with a known type
        // that's been unchecked are.
        const visibleBuilds = store.builds.filter((build) => {
            const rootType = build.items[0] ? store.getItem(build.items[0])?.itemType : undefined;
            return !rootType || typeFilter.includes(rootType);
        });
        const visibleIds = new Set(visibleBuilds.map((build) => build.id));

        const nodes: BuildNode[] = visibleBuilds.map((build) => ({
            id: build.id,
            icon: resolveBuildIcon(build, (id) => store.getItem(id), (itemId) => store.getItemIcon(itemId)),
            name: build.name || "Без названия",
        }));

        const links: BuildLink[] = connections
            .filter((connection) => visibleIds.has(connection.source) && visibleIds.has(connection.target))
            .map((connection) => ({
                source: connection.source,
                target: connection.target,
                strength: connection.strength,
                manual: connection.manual,
            }));

        return { nodes, links };
        // getItem/getItemIcon are stable methods on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.builds, store.upgradeChains, typeFilter]);

    // Hovering a node highlights it, every link touching it, and every build on the other end of those links.
    // Hovering a link highlights just that link and its two endpoint builds. `null` means "nothing hovered" —
    // rendering treats that as "show everything at full opacity", not "highlight nothing".
    const highlightedNodeIds = useMemo(() => {
        if (hoveredNodeId) {
            const ids = new Set<string>([hoveredNodeId]);
            for (const link of graphData.links) {
                const source = linkEndpointId(link.source);
                const target = linkEndpointId(link.target);
                if (source === hoveredNodeId) ids.add(target);
                if (target === hoveredNodeId) ids.add(source);
            }
            return ids;
        }
        if (hoveredLinkKey) {
            const link = graphData.links.find((entry) => linkKey(entry) === hoveredLinkKey);
            return link ? new Set([linkEndpointId(link.source), linkEndpointId(link.target)]) : null;
        }
        return null;
    }, [hoveredNodeId, hoveredLinkKey, graphData.links]);

    const highlightedLinkKeys = useMemo(() => {
        if (hoveredNodeId) {
            return new Set(
                graphData.links
                    .filter(
                        (link) =>
                            linkEndpointId(link.source) === hoveredNodeId || linkEndpointId(link.target) === hoveredNodeId
                    )
                    .map(linkKey)
            );
        }
        if (hoveredLinkKey) return new Set([hoveredLinkKey]);
        return null;
    }, [hoveredNodeId, hoveredLinkKey, graphData.links]);

    const handleTypeFilterChange = (event: SelectChangeEvent<string[]>) => {
        const { value } = event.target;
        setTypeFilter(typeof value === "string" ? value.split(",") : value);
    };

    return (
        <Stack spacing={2} sx={{ height: "100%" }}>
            <Typography variant="h4">Граф</Typography>

            <Typography variant="body2" color="text.secondary">
                Билды связаны, если у них есть общие предметы (толщина линии — насколько сильно, относительно
                меньшего билда, плюс цвет — от красного к зелёному, чем сильнее связь), либо если связь добавлена
                вручную на странице билда (оранжевая линия).
            </Typography>

            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    Предметы:
                </Typography>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                    <Select
                        multiple
                        displayEmpty
                        value={typeFilter}
                        onChange={handleTypeFilterChange}
                        renderValue={(selected) =>
                            selected.length === 0
                                ? "Ничего не выбрано"
                                : selected.length === ITEM_TYPE_OPTIONS.length
                                  ? "Все"
                                  : selected.join(", ")
                        }
                    >
                        {ITEM_TYPE_OPTIONS.map((type) => (
                            <MenuItem key={type} value={type}>
                                <Checkbox size="small" checked={typeFilter.includes(type)} />
                                <ListItemText primary={type} />
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Stack>

            <Box
                ref={containerRef}
                sx={{
                    position: "relative",
                    flex: 1,
                    minHeight: 500,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    overflow: "hidden",
                }}
            >
                {graphData.nodes.length === 0 ? (
                    <Stack sx={{ height: "100%", alignItems: "center", justifyContent: "center" }}>
                        <Typography color="text.secondary">
                            Билдов пока нет — создайте их на странице «Билды».
                        </Typography>
                    </Stack>
                ) : (
                    <>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={showLabels}
                                    onChange={(event) => setShowLabels(event.target.checked)}
                                />
                            }
                            label="Названия"
                            sx={{
                                position: "absolute",
                                top: 4,
                                left: 4,
                                zIndex: 1,
                                m: 0,
                                bgcolor: "background.paper",
                                borderRadius: 1,
                                pr: 1,
                            }}
                        />

                        <ForceGraph2D<BuildNode, BuildLink>
                            graphData={graphData}
                            width={size.width}
                            height={size.height}
                            nodeId="id"
                            nodeLabel="name"
                            linkColor={(link) => {
                                const baseColor = link.manual ? "#ffb74d" : linkStrengthColor(link.strength);
                                if (!highlightedLinkKeys) return baseColor;
                                return highlightedLinkKeys.has(linkKey(link)) ? baseColor : "rgba(120,120,120,0.06)";
                            }}
                            linkWidth={(link) => {
                                const base = 1 + link.strength * 4;
                                if (!highlightedLinkKeys) return base;
                                return highlightedLinkKeys.has(linkKey(link)) ? base + 1.5 : base;
                            }}
                            backgroundColor="rgba(0,0,0,0)"
                            onNodeClick={(node) => setOpenBuildId(String(node.id))}
                            onNodeHover={(node) => {
                                const id = node ? String(node.id) : null;
                                hoveredNodeRef.current = id;
                                setHoveredNodeId(id);
                                if (node) setHoveredLinkKey(null);
                            }}
                            onLinkHover={(link) => {
                                // A node under the cursor always wins — ignore this frame's link hit entirely
                                // rather than let it briefly clobber the node highlight when both geometrically
                                // overlap (an edge's endpoint sits right at its connected node).
                                if (hoveredNodeRef.current) return;
                                setHoveredLinkKey(link ? linkKey(link) : null);
                            }}
                            nodeCanvasObjectMode={() => "replace"}
                            nodeCanvasObject={(node, ctx, globalScale) => {
                                const x = node.x ?? 0;
                                const y = node.y ?? 0;
                                const isDimmed = highlightedNodeIds !== null && !highlightedNodeIds.has(String(node.id));

                                ctx.save();
                                if (isDimmed) ctx.globalAlpha = 0.2;

                                ctx.beginPath();
                                ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
                                ctx.fillStyle = "#2B2D31";
                                ctx.fill();
                                ctx.lineWidth = 1.5;
                                ctx.strokeStyle = "#5B8CFF";
                                ctx.stroke();

                                let spriteDrawn = false;
                                if (node.icon.kind === "sprite") {
                                    const sprite = getCachedSprite(
                                        spriteCacheRef.current,
                                        failedSpritesRef.current,
                                        node.icon.path,
                                        repaintOnSpriteLoad
                                    );
                                    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
                                        const spriteSize = NODE_RADIUS * 1.6;
                                        ctx.save();
                                        ctx.beginPath();
                                        ctx.arc(x, y, NODE_RADIUS - 1, 0, 2 * Math.PI);
                                        ctx.clip();
                                        ctx.drawImage(sprite, x - spriteSize / 2, y - spriteSize / 2, spriteSize, spriteSize);
                                        ctx.restore();
                                        spriteDrawn = true;
                                    }
                                }

                                if (!spriteDrawn) {
                                    const label = node.icon.kind === "sprite" ? node.icon.fallback : node.icon.value;
                                    ctx.font = `${NODE_RADIUS * 1.5}px sans-serif`;
                                    ctx.textAlign = "center";
                                    ctx.textBaseline = "middle";
                                    ctx.fillText(label, x, y);
                                }

                                if (showLabels) {
                                    const fontSize = 12 / globalScale;
                                    ctx.font = `${fontSize}px sans-serif`;
                                    ctx.textAlign = "center";
                                    ctx.textBaseline = "top";
                                    ctx.fillStyle = "#c7ccd4";
                                    ctx.fillText(node.name, x, y + NODE_RADIUS + 3 / globalScale);
                                }

                                ctx.restore();
                            }}
                            nodePointerAreaPaint={(node, color, ctx) => {
                                ctx.fillStyle = color;
                                ctx.beginPath();
                                ctx.arc(node.x ?? 0, node.y ?? 0, NODE_RADIUS, 0, 2 * Math.PI);
                                ctx.fill();
                            }}
                        />
                    </>
                )}
            </Box>

            <DetailModal open={openBuildId !== null} onClose={() => setOpenBuildId(null)}>
                {openBuildId && <BuildDetailPage id={openBuildId} />}
            </DetailModal>
        </Stack>
    );
}
