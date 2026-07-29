import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, MenuItem, Paper, Select, Stack, Typography } from "@mui/material";
import { MECHANIC_BLOCKS, MECHANIC_KINDS, MECHANIC_MISC_FIELDS, blockLabel } from "./mechanicSchema";
import { HANDLE_STYLE } from "./handleStyle";
import EnumField from "./EnumField";
import type { MechanicFlowNode } from "./types";

const ROW_HEIGHT = 28;
const TOP_OFFSET = 24;

export default function MechanicNode({ data, selected }: NodeProps<MechanicFlowNode>) {
    const blocks = MECHANIC_BLOCKS[data.kind];
    const leftBlocks = blocks.filter((b) => b.side === "left");
    const rightBlocks = blocks.filter((b) => b.side === "right");
    const miscFields = MECHANIC_MISC_FIELDS[data.kind];

    return (
        <Paper
            variant="outlined"
            sx={{
                width: 260,
                borderColor: selected ? "primary.main" : "divider",
                borderWidth: selected ? 2 : 1,
                overflow: "visible",
            }}
        >
            <Handle type="target" id="owns" position={Position.Left} style={{ top: TOP_OFFSET, ...HANDLE_STYLE }} />

            {leftBlocks.map((block, i) => (
                <Box key={block.kind} sx={{ position: "relative" }}>
                    <Handle
                        type="source"
                        id={block.kind}
                        position={Position.Left}
                        style={{ top: TOP_OFFSET + ROW_HEIGHT * (i + 1), ...HANDLE_STYLE }}
                    />
                    <Typography
                        variant="caption"
                        sx={{
                            position: "absolute",
                            left: 10,
                            top: TOP_OFFSET + ROW_HEIGHT * (i + 1) - 8,
                            color: "text.secondary",
                            pointerEvents: "none",
                        }}
                    >
                        ← {blockLabel(block.kind)}
                    </Typography>
                </Box>
            ))}

            {rightBlocks.map((block, i) => (
                <Box key={block.kind} sx={{ position: "relative" }}>
                    <Handle
                        type="source"
                        id={block.kind}
                        position={Position.Right}
                        style={{ top: TOP_OFFSET + ROW_HEIGHT * i, ...HANDLE_STYLE }}
                    />
                    <Typography
                        variant="caption"
                        sx={{
                            position: "absolute",
                            right: 10,
                            top: TOP_OFFSET + ROW_HEIGHT * i - 8,
                            color: "text.secondary",
                            pointerEvents: "none",
                        }}
                    >
                        {blockLabel(block.kind)} →
                    </Typography>
                </Box>
            ))}

            <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    ⚙️ Mechanic
                </Typography>
                {data.existing && (
                    <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>
                        существующая строка — правки не экспортируются
                    </Typography>
                )}
            </Box>

            <Stack
                spacing={1}
                className="nodrag"
                sx={{
                    p: 1.5,
                    pt: `${TOP_OFFSET + ROW_HEIGHT * (Math.max(leftBlocks.length, rightBlocks.length) + 1) + 8}px`,
                }}
            >
                <Select
                    size="small"
                    value={data.kind}
                    onChange={(e) => data.onKindChange(e.target.value as (typeof MECHANIC_KINDS)[number])}
                >
                    {MECHANIC_KINDS.map((kind) => (
                        <MenuItem key={kind} value={kind}>
                            {kind}
                        </MenuItem>
                    ))}
                </Select>

                {miscFields.map((field) => (
                    <EnumField
                        key={field}
                        field={field}
                        value={data.fields[field] ?? ""}
                        onChange={(value) => data.onFieldChange(field, value)}
                    />
                ))}
            </Stack>
        </Paper>
    );
}
