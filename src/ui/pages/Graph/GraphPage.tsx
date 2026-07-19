import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Checkbox, FormControlLabel, Stack, Typography } from "@mui/material";
import ForceGraph2D from "react-force-graph-2d";
import { useStore } from "../../hooks/useStore";
import { computeBuildConnections } from "../../../core/domain/relations";

const NODE_RADIUS = 9;

interface BuildNode {
    id: string;

    icon: string;

    name: string;
}

interface BuildLink {
    source: string;

    target: string;

    strength: number;

    manual: boolean;
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
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });
    const [showLabels, setShowLabels] = useState(false);

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
        const connections = computeBuildConnections(store.builds, store.upgradeChains);

        const nodes: BuildNode[] = store.builds.map((build) => ({
            id: build.id,
            icon: build.icon || "🧠",
            name: build.name || "Без названия",
        }));

        const links: BuildLink[] = connections.map((connection) => ({
            source: connection.source,
            target: connection.target,
            strength: connection.strength,
            manual: connection.manual,
        }));

        return { nodes, links };
    }, [store.builds, store.upgradeChains]);

    return (
        <Stack spacing={2} sx={{ height: "100%" }}>
            <Typography variant="h4">Граф</Typography>

            <Typography variant="body2" color="text.secondary">
                Билды связаны, если у них есть общие предметы (толщина линии — насколько сильно, относительно
                меньшего билда, плюс цвет — от красного к зелёному, чем сильнее связь), либо если связь добавлена
                вручную на странице билда (оранжевая линия).
            </Typography>

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
                            linkColor={(link) => (link.manual ? "#ffb74d" : linkStrengthColor(link.strength))}
                            linkWidth={(link) => 1 + link.strength * 4}
                            backgroundColor="rgba(0,0,0,0)"
                            onNodeClick={(node) => navigate(`/builds/${encodeURIComponent(String(node.id))}`)}
                            nodeCanvasObjectMode={() => "replace"}
                            nodeCanvasObject={(node, ctx, globalScale) => {
                                const x = node.x ?? 0;
                                const y = node.y ?? 0;

                                ctx.beginPath();
                                ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
                                ctx.fillStyle = "#2B2D31";
                                ctx.fill();
                                ctx.lineWidth = 1.5;
                                ctx.strokeStyle = "#5B8CFF";
                                ctx.stroke();

                                ctx.font = `${NODE_RADIUS * 1.5}px sans-serif`;
                                ctx.textAlign = "center";
                                ctx.textBaseline = "middle";
                                ctx.fillText(node.icon, x, y);

                                if (showLabels) {
                                    const fontSize = 12 / globalScale;
                                    ctx.font = `${fontSize}px sans-serif`;
                                    ctx.textAlign = "center";
                                    ctx.textBaseline = "top";
                                    ctx.fillStyle = "#c7ccd4";
                                    ctx.fillText(node.name, x, y + NODE_RADIUS + 3 / globalScale);
                                }
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
        </Stack>
    );
}
