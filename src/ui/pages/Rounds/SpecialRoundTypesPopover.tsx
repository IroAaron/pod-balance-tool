import { useState } from "react";
import { Box, Button, IconButton, Popover, Stack, TextField, Typography } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";

type Entry = { id: string; value: string };

function makeEntry(value: string): Entry {
    return { id: `special-round-type-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, value };
}

/** Add/remove popup for the curated "Спец. раунд" list (store.specialRoundTypes) — same "small hand-curated
 *  list, full replace on every edit" convention as TagIconsTab, condensed into a popover (opened to the right of
 *  the trigger button) instead of a full tab, since this is just a flat list of strings, not tag+icon+note rows.
 *  Local `entries` state mirrors TagIconsEditor's own local-list-plus-commit-on-blur shape — needed so a row can
 *  be typed into without losing focus on every keystroke, and re-keyed (via `key={store.specialRoundTypesReady}`)
 *  once real Firestore data replaces the initial empty list, same as TagIconsTab's own default export. */
function SpecialRoundTypesEditor({ initialValues }: { initialValues: string[] }) {
    const store = useStore();
    const [entries, setEntries] = useState<Entry[]>(() => initialValues.map(makeEntry));

    const commit = (next: Entry[]) => {
        setEntries(next);
        store.setSpecialRoundTypes(next.map((entry) => entry.value).filter((value) => value.trim() !== ""));
    };

    const handleAdd = () => setEntries((prev) => [...prev, makeEntry("")]);

    const handleChange = (id: string, value: string) => {
        setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, value } : entry)));
    };

    const handleBlur = () => commit(entries);

    const handleDelete = (id: string) => commit(entries.filter((entry) => entry.id !== id));

    return (
        <Stack spacing={1.5} sx={{ p: 2, width: 280 }}>
            <Typography variant="subtitle2">Список «Спец. раунд»</Typography>

            {entries.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    Список пока пуст.
                </Typography>
            )}

            <Stack spacing={1}>
                {entries.map((entry) => (
                    <Stack key={entry.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <TextField
                            size="small"
                            value={entry.value}
                            onChange={(event) => handleChange(entry.id, event.target.value)}
                            onBlur={handleBlur}
                            fullWidth
                        />
                        <IconButton aria-label="Удалить значение" size="small" onClick={() => handleDelete(entry.id)}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                ))}
            </Stack>

            <Button size="small" onClick={handleAdd} sx={{ alignSelf: "flex-start" }}>
                + Добавить
            </Button>
        </Stack>
    );
}

export default function SpecialRoundTypesPopover() {
    const store = useStore();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    return (
        <Box>
            <IconButton
                aria-label="Управлять списком «Спец. раунд»"
                size="small"
                onClick={(event) => setAnchorEl(event.currentTarget)}
            >
                <SettingsIcon fontSize="small" />
            </IconButton>

            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: "center", horizontal: "right" }}
                transformOrigin={{ vertical: "center", horizontal: "left" }}
            >
                <SpecialRoundTypesEditor
                    key={store.specialRoundTypesReady ? "ready" : "loading"}
                    initialValues={store.specialRoundTypes}
                />
            </Popover>
        </Box>
    );
}
