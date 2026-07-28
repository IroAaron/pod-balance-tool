import { useState } from "react";
import { Box, Chip, Drawer, IconButton, Stack, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import { ENUM_DIMENSIONS } from "./enumData";
import { useEnumRegistry } from "./EnumRegistryContext";

interface Props {
    open: boolean;
    onClose: () => void;
}

function DimensionEditor({ dimension }: { dimension: string }) {
    const { values, addValue, removeValue } = useEnumRegistry();
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
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                {(values[dimension] ?? []).map((v) => (
                    <Chip key={v} label={v} size="small" onDelete={() => removeValue(dimension, v)} />
                ))}
            </Box>
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
            <Box sx={{ width: 320, p: 2 }}>
                <Stack direction="row" sx={{ mb: 2, alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="h6">Enum-справочник</Typography>
                    <IconButton size="small" onClick={onClose}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Stack>

                <Stack spacing={2.5}>
                    {ENUM_DIMENSIONS.map((dimension) => (
                        <DimensionEditor key={dimension} dimension={dimension} />
                    ))}
                </Stack>
            </Box>
        </Drawer>
    );
}
