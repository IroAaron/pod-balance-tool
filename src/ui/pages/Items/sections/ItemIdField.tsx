import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useStore } from "../../../hooks/useStore";
import type { Item } from "../../../../core/models/Item";

/**
 * The id line under the item's name. It's editable only while the item exists on the site alone: once exported,
 * the sheet has a row under that id and every other table joins on it, so renaming here would orphan those rows
 * rather than move them. Renaming a local draft is safe, and the store moves all its references along.
 */
export default function ItemIdField({ item, inModal }: { item: Item; inModal: boolean }) {
    const store = useStore();
    const navigate = useNavigate();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);

    const renameable = store.canRenameItem(item.id);

    const commit = () => {
        const result = store.renameItem(item.id, draft);
        if (!result.ok) {
            setError(result.error ?? "Не удалось переименовать");
            return;
        }
        setEditing(false);
        setError(null);
        // The route carries the old id, so stay on the item by following it to the new one.
        if (!inModal) navigate(`/items/${encodeURIComponent(draft.trim())}`, { replace: true });
    };

    if (!editing) {
        return (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    {item.id}
                    {item.itemType ? ` · ${item.itemType}` : ""}
                </Typography>
                {renameable && (
                    <Tooltip title="Изменить id — можно, пока предмет не выгружен в таблицу">
                        <IconButton
                            size="small"
                            aria-label="Изменить id"
                            onClick={() => {
                                setDraft(item.id);
                                setError(null);
                                setEditing(true);
                            }}
                        >
                            <EditIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Stack>
        );
    }

    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mt: 0.5 }}>
            <TextField
                size="small"
                label="ItemId"
                value={draft}
                onChange={(event) => {
                    setDraft(event.target.value);
                    setError(null);
                }}
                error={Boolean(error)}
                helperText={error ?? "Ссылки на предмет (механики, цепочка, замены) переедут вместе с ним."}
                autoFocus
                sx={{ maxWidth: 360 }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        commit();
                    }
                }}
            />
            <Button size="small" variant="contained" onClick={commit} disabled={!draft.trim()}>
                OK
            </Button>
            <Button size="small" onClick={() => setEditing(false)}>
                Отмена
            </Button>
        </Stack>
    );
}
