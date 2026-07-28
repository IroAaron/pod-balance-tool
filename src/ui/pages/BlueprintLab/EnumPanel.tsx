import { useState } from "react";
import { Box, Divider, Drawer, IconButton, Stack, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import { ENUM_DIMENSIONS } from "./enumData";
import { useEnumRegistry } from "./EnumRegistryContext";

interface Props {
    open: boolean;
    onClose: () => void;
}

function DimensionEditor({ dimension }: { dimension: string }) {
    const { values, descriptions, valueDescriptions, addValue, removeValue, setDescription, setValueDescription } =
        useEnumRegistry();
    const [draft, setDraft] = useState("");

    const submit = () => {
        addValue(dimension, draft);
        setDraft("");
    };

    return (
        <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {dimension}
            </Typography>
            <TextField
                size="small"
                fullWidth
                placeholder="Пояснение для этого dropdown'а"
                value={descriptions[dimension] ?? ""}
                onChange={(e) => setDescription(dimension, e.target.value)}
                sx={{ mb: 1 }}
            />

            <Stack spacing={0.5} sx={{ mb: 1 }}>
                {(values[dimension] ?? []).map((v) => (
                    <Stack key={v} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Typography variant="body2" sx={{ minWidth: 90, flexShrink: 0 }} noWrap title={v}>
                            {v}
                        </Typography>
                        <TextField
                            size="small"
                            fullWidth
                            placeholder="что значит это значение"
                            value={valueDescriptions[dimension]?.[v] ?? ""}
                            onChange={(e) => setValueDescription(dimension, v, e.target.value)}
                        />
                        <IconButton size="small" onClick={() => removeValue(dimension, v)}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                ))}
            </Stack>

            <Stack direction="row" spacing={1}>
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Новое значение"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            submit();
                        }
                    }}
                />
                <IconButton size="small" onClick={submit} disabled={!draft.trim()}>
                    <AddIcon fontSize="small" />
                </IconButton>
            </Stack>
        </Box>
    );
}

export default function EnumPanel({ open, onClose }: Props) {
    return (
        <Drawer anchor="right" open={open} onClose={onClose}>
            <Box sx={{ width: 420, p: 2 }}>
                <Stack direction="row" sx={{ mb: 2, alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="h6">Enum-справочник</Typography>
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Stack>

                <Stack spacing={2.5} divider={<Divider />}>
                    {ENUM_DIMENSIONS.map((dimension) => (
                        <DimensionEditor key={dimension} dimension={dimension} />
                    ))}
                </Stack>
            </Box>
        </Drawer>
    );
}
