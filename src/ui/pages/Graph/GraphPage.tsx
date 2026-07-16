import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import ForceGraph2D, { type NodeObject } from "react-force-graph-2d";
import { useStore } from "../../hooks/useStore";
import type { GraphNode } from "../../../core/services/GraphService";

export default function GraphPage() {
    const store = useStore();
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });
    const [tagFilter, setTagFilter] = useState<string | null>(null);

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

    const filteredBuilds = useMemo(() => {
        if (!tagFilter) return store.builds;
        return store.builds.filter((build) =>
            build.items.some((itemId) => store.getItem(itemId)?.tags.includes(tagFilter))
        );
        // getItem is a stable method on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.builds, store.items, tagFilter]);

    const graphData = useMemo(
        () => store.graphService.build(store.items, filteredBuilds, store.upgradeChains, (item) => store.itemName(item)),
        // graphService/itemName are stable methods on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [store.items, filteredBuilds, store.upgradeChains, store.translations]
    );

    const availableTags = store.paramValues.ItemTag ?? [];

    return (
        <Stack spacing={2} sx={{ height: "100%" }}>
            <Typography variant="h4">Граф</Typography>

            <Autocomplete
                options={availableTags}
                value={tagFilter}
                onChange={(_event, value) => setTagFilter(value)}
                renderInput={(params) => <TextField {...params} label="Фильтр по тегу (билды)" size="small" />}
                sx={{ maxWidth: 300 }}
            />

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
                            Нет данных для графа — загрузите предметы и создайте билды.
                        </Typography>
                    </Stack>
                ) : (
                    <ForceGraph2D<GraphNode, object>
                        graphData={graphData}
                        width={size.width}
                        height={size.height}
                        nodeId="id"
                        nodeLabel="label"
                        nodeRelSize={5}
                        nodeVal={(node) => (node.kind === "build" ? 8 : 3)}
                        nodeColor={(node) => (node.kind === "build" ? "#5B8CFF" : "#8f97a3")}
                        linkColor={() => "rgba(255,255,255,0.2)"}
                        backgroundColor="rgba(0,0,0,0)"
                        onNodeClick={(node) => {
                            const encodedId = encodeURIComponent(String(node.id));
                            navigate(node.kind === "build" ? `/builds/${encodedId}` : `/items/${encodedId}`);
                        }}
                        nodeCanvasObjectMode={() => "after"}
                        nodeCanvasObject={(node: NodeObject<GraphNode>, ctx, globalScale) => {
                            const fontSize = (node.kind === "build" ? 14 : 11) / globalScale;
                            ctx.font = `${fontSize}px sans-serif`;
                            ctx.textAlign = "center";
                            ctx.textBaseline = "top";
                            ctx.fillStyle = node.kind === "build" ? "#5B8CFF" : "#c7ccd4";
                            ctx.fillText(node.label, node.x ?? 0, (node.y ?? 0) + 6);
                        }}
                    />
                )}
            </Box>
        </Stack>
    );
}
