import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, MenuItem, Paper, Select, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { MECHANIC_KINDS } from "./mechanicSchema";
import { ITEM_CATEGORY_COLUMNS } from "./itemSchema";
import { HANDLE_STYLE } from "./handleStyle";
import EnumField from "./EnumField";
import EnumMultiSelect from "./EnumMultiSelect";
import type { ItemFlowNode, ItemKind } from "./types";

const ITEM_KINDS: ItemKind[] = ["Card", "House", "Artefact"];

export default function ItemNode({ data, selected }: NodeProps<ItemFlowNode>) {
    const [addMechanicOpen, setAddMechanicOpen] = useState(false);
    const store = useStore();

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
            <Handle type="target" id="ref" position={Position.Left} style={{ top: 24, ...HANDLE_STYLE }} />
            <Handle type="source" id="owns" position={Position.Right} style={{ top: 24, ...HANDLE_STYLE }} />

            <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover", borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    📦 Предмет{data.locked ? " · загружен из «Предметы»" : ""}
                </Typography>
            </Box>

            <Stack spacing={1} sx={{ p: 1.5 }} className="nodrag">
                <TextField
                    size="small"
                    label="ItemId"
                    value={data.itemId}
                    disabled={data.locked}
                    onChange={(e) => data.onChange({ itemId: e.target.value })}
                />

                <TextField
                    size="small"
                    label="Название"
                    disabled={!data.nameKey}
                    helperText={!data.nameKey ? "сначала укажите ItemId" : undefined}
                    value={data.nameKey ? store.getTranslation(data.nameKey) ?? "" : ""}
                    onChange={(e) => store.setTranslationOverride(data.nameKey, e.target.value)}
                />

                <TextField
                    size="small"
                    label="Описание"
                    multiline
                    minRows={2}
                    disabled={!data.descKey}
                    value={data.descKey ? store.getTranslation(data.descKey) ?? "" : ""}
                    onChange={(e) => store.setTranslationOverride(data.descKey, e.target.value)}
                />

                <Select
                    size="small"
                    value={data.itemType}
                    disabled={data.locked}
                    onChange={(e) => data.onChange({ itemType: e.target.value as ItemKind })}
                >
                    {ITEM_KINDS.map((kind) => (
                        <MenuItem key={kind} value={kind}>
                            {kind}
                        </MenuItem>
                    ))}
                </Select>

                <EnumMultiSelect dimension="ItemTag" label="Теги" value={data.tags} onChange={(tags) => data.onChange({ tags })} />
                <EnumMultiSelect
                    dimension="TargetColor"
                    label="Возможные цвета"
                    value={data.possibleColors}
                    onChange={(possibleColors) => data.onChange({ possibleColors })}
                />

                {ITEM_CATEGORY_COLUMNS[data.itemType].map((field) => (
                    <EnumField
                        key={field}
                        field={field}
                        value={data.rawFields[field] ?? ""}
                        onChange={(value) => data.onRawFieldChange(field, value)}
                    />
                ))}

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
                            {kind}
                        </MenuItem>
                    ))}
                </Select>
            </Stack>
        </Paper>
    );
}
