import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Stack, Typography } from "@mui/material";
import ForceGraph2D from "react-force-graph-2d";
import { useStore } from "../../hooks/useStore";
import { computeBuildConnections } from "../../../core/domain/relations";

interface BuildNode {
    id: string;

    label: string;
}

interface BuildLink {
    source: string;

    target: string;

    strength: number;

    manual: boolean;
}

export default function GraphPage() {
    const store = useStore();
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });

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
            label: `${build.icon || "🧠"} ${build.name || "Без названия"}`,
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
                меньшего билда), либо если связь добавлена вручную на странице билда (оранжевая линия).
            </Typography>

            <Box
                ref={containerRef}
                sx={{
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
                    <ForceGraph2D<BuildNode, BuildLink>
                        graphData={graphData}
                        width={size.width}
                        height={size.height}
                        nodeId="id"
                        nodeLabel="label"
                        nodeRelSize={6}
                        nodeColor={() => "#5B8CFF"}
                        linkColor={(link) => (link.manual ? "#ffb74d" : `rgba(255,255,255,${0.15 + link.strength * 0.6})`)}
                        linkWidth={(link) => 1 + link.strength * 4}
                        backgroundColor="rgba(0,0,0,0)"
                        onNodeClick={(node) => navigate(`/builds/${encodeURIComponent(String(node.id))}`)}
                        nodeCanvasObjectMode={() => "after"}
                        nodeCanvasObject={(node, ctx, globalScale) => {
                            const fontSize = 12 / globalScale;
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.textAlign = "center";
                            ctx.textBaseline = "top";
                            ctx.fillStyle = "#c7ccd4";
                            ctx.fillText(node.label, node.x ?? 0, (node.y ?? 0) + 8);
                        }}
                    />
                )}
            </Box>
        </Stack>
    );
}
