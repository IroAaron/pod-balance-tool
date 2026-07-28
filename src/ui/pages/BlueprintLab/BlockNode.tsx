import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { MECHANIC_BLOCKS, PLAIN_ITEM_REF_FIELDS, blockLabel } from "./mechanicSchema";
import { HANDLE_STYLE } from "./handleStyle";
import EnumField from "./EnumField";
import ItemRefSelect from "./ItemRefSelect";
import type { BlockFlowNode } from "./types";

function BlockField({ field, value, onChange }: { field: string; value: string; onChange: (value: string) => void }) {
    if (PLAIN_ITEM_REF_FIELDS.has(field)) {
        return <ItemRefSelect field={field} value={value} onChange={onChange} />;
    }
    return <EnumField field={field} value={value} onChange={onChange} />;
}

export default function BlockNode({ data, selected }: NodeProps<BlockFlowNode>) {
    const definition = MECHANIC_BLOCKS[data.mechanicKind].find((b) => b.kind === data.blockKind);
    if (!definition) return null;

    // The block spawns on whichever side its point sits on the mechanic node, so the "in" handle faces back
    // toward it: a left-side block (Activator) connects from its right edge, everything else from its left.
    const inHandlePosition = definition.side === "left" ? Position.Right : Position.Left;

    return (
        <Paper
            variant="outlined"
            sx={{
                width: 230,
                borderColor: selected ? "primary.main" : "divider",
                borderWidth: selected ? 2 : 1,
                overflow: "visible",
            }}
        >
            <Handle type="target" id="in" position={inHandlePosition} style={{ top: 24, ...HANDLE_STYLE }} />

            {definition.itemRefField && (
                <Box sx={{ position: "relative" }}>
                    <Handle type="source" id="itemRef" position={Position.Right} style={{ top: 24, ...HANDLE_STYLE }} />
                    <Typography
                        variant="caption"
                        sx={{ position: "absolute", right: 10, top: 16, color: "text.secondary", pointerEvents: "none" }}
                    >
                        {definition.itemRefField} →
                    </Typography>
                </Box>
            )}

            <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {blockLabel(data.blockKind)}
                </Typography>
            </Box>

            <Stack spacing={1} className="nodrag" sx={{ p: 1.5, pt: definition.itemRefField ? "32px" : 1.5 }}>
                <BlockField
                    field={definition.primaryField}
                    value={data.fields[definition.primaryField] ?? ""}
                    onChange={(value) => data.onFieldChange(definition.primaryField, value)}
                />

                {definition.otherFields.map((field) => (
                    <BlockField
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
