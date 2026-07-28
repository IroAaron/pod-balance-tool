import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, MenuItem, Paper, Select, Stack, TextField, Typography } from "@mui/material";
import { MECHANIC_KINDS, MECHANIC_LABELS } from "./mechanicSchema";
import type { ItemFlowNode, ItemKind } from "./types";

const ITEM_KINDS: ItemKind[] = ["Card", "House", "Artefact"];

export default function ItemNode({ data, selected }: NodeProps<ItemFlowNode>) {
    const [addMechanicOpen, setAddMechanicOpen] = useState(false);

    return (
        <Paper
            variant="outlined"
            sx={{
                width: 220,
                borderColor: selected ? "primary.main" : "divider",
                borderWidth: selected ? 2 : 1,
                overflow: "visible",
            }}
        >
            <Handle type="target" id="ref" position={Position.Left} style={{ top: 24 }} />
            <Handle type="source" id="owns" position={Position.Right} style={{ top: 24 }} />

            <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover", borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    📦 Предмет
                </Typography>
            </Box>

            <Stack spacing={1} sx={{ p: 1.5 }} className="nodrag">
                <TextField
                    size="small"
                    label="Название"
                    value={data.name}
                    onChange={(e) => data.onChange({ name: e.target.value })}
                />

                <Select
                    size="small"
                    value={data.itemType}
                    onChange={(e) => data.onChange({ itemType: e.target.value as ItemKind })}
                >
                    {ITEM_KINDS.map((kind) => (
                        <MenuItem key={kind} value={kind}>
                            {kind}
                        </MenuItem>
                    ))}
                </Select>

                <TextField
                    size="small"
                    label="Теги (через запятую)"
                    value={data.tags}
                    onChange={(e) => data.onChange({ tags: e.target.value })}
                />

                <Select
                    size="small"
                    displayEmpty
                    value=""
                    open={addMechanicOpen}
                    onOpen={() => setAddMechanicOpen(true)}
                    onClose={() => setAddMechanicOpen(false)}
                    onChange={(e) => {
                        data.onAddMechanic(e.target.value as (typeof MECHANIC_KINDS)[number]);
                        setAddMechanicOpen(false);
                    }}
                    renderValue={() => "+ Добавить механику"}
                >
                    {MECHANIC_KINDS.map((kind) => (
                        <MenuItem key={kind} value={kind}>
                            {MECHANIC_LABELS[kind]}
                        </MenuItem>
                    ))}
                </Select>
            </Stack>
        </Paper>
    );
}
