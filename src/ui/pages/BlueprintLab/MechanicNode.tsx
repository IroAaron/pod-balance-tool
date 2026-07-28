import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, MenuItem, Paper, Select, Stack, TextField, Typography } from "@mui/material";
import { MECHANIC_KINDS, MECHANIC_LABELS, MECHANIC_REF_POINTS, MECHANIC_SCALAR_FIELDS } from "./mechanicSchema";
import type { MechanicFlowNode } from "./types";

const HANDLE_ROW_HEIGHT = 28;
const HANDLE_TOP_OFFSET = 24;

export default function MechanicNode({ data, selected }: NodeProps<MechanicFlowNode>) {
    const refPoints = MECHANIC_REF_POINTS[data.kind];
    const scalarFields = MECHANIC_SCALAR_FIELDS[data.kind];

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
            <Handle type="target" id="owns" position={Position.Left} style={{ top: HANDLE_TOP_OFFSET }} />

            <Box sx={{ position: "relative" }}>
                <Handle
                    type="source"
                    id="activator"
                    position={Position.Left}
                    style={{ top: HANDLE_TOP_OFFSET + HANDLE_ROW_HEIGHT }}
                />
                <Typography
                    variant="caption"
                    sx={{
                        position: "absolute",
                        left: 10,
                        top: HANDLE_TOP_OFFSET + HANDLE_ROW_HEIGHT - 8,
                        color: "text.secondary",
                        pointerEvents: "none",
                    }}
                >
                    ← Активатор
                </Typography>
            </Box>

            {refPoints.map((point, i) => (
                <Box key={point.key} sx={{ position: "relative" }}>
                    <Handle
                        type="source"
                        id={point.key}
                        position={Position.Right}
                        style={{ top: HANDLE_TOP_OFFSET + HANDLE_ROW_HEIGHT * i }}
                    />
                    <Typography
                        variant="caption"
                        sx={{
                            position: "absolute",
                            right: 10,
                            top: HANDLE_TOP_OFFSET + HANDLE_ROW_HEIGHT * i - 8,
                            color: "text.secondary",
                            pointerEvents: "none",
                        }}
                    >
                        {point.label} →
                    </Typography>
                </Box>
            ))}

            <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    ⚙️ Механика
                </Typography>
            </Box>

            <Stack
                spacing={1}
                className="nodrag"
                sx={{
                    p: 1.5,
                    pt: `${HANDLE_TOP_OFFSET + HANDLE_ROW_HEIGHT * Math.max(1, refPoints.length) + 8}px`,
                    maxHeight: 320,
                    overflowY: "auto",
                }}
            >
                <Select size="small" value={data.kind} onChange={(e) => data.onKindChange(e.target.value as (typeof MECHANIC_KINDS)[number])}>
                    {MECHANIC_KINDS.map((kind) => (
                        <MenuItem key={kind} value={kind}>
                            {MECHANIC_LABELS[kind]}
                        </MenuItem>
                    ))}
                </Select>

                {scalarFields.map((field) => (
                    <TextField
                        key={field}
                        size="small"
                        label={field}
                        value={data.fields[field] ?? ""}
                        onChange={(e) => data.onFieldChange(field, e.target.value)}
                    />
                ))}
            </Stack>
        </Paper>
    );
}
