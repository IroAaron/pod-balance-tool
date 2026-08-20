import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Stack,
    TextField,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { ITEM_KINDS, type ItemKind } from "../../components/content/itemSchema";
import { applyIdRules } from "../../../core/domain/idRules";

interface Props {
    open: boolean;
    onClose: () => void;
}

/**
 * Creates the row and nothing else — everything else about the item is filled in on its own card, which is
 * where all the real editing lives. The id is the one thing that can't be changed comfortably later (it's the
 * key every table joins on), so it's the one thing this asks for up front.
 */
export default function NewItemDialog({ open, onClose }: Props) {
    const store = useStore();
    const navigate = useNavigate();
    const [id, setId] = useState("");
    const [itemType, setItemType] = useState<ItemKind>("Card");

    // The rules can rewrite the id, so uniqueness is checked against what will actually be created.
    const { id: finalId, applied } = applyIdRules(id, itemType, store.contentSettings.validateIdsOnCreate);
    const taken = Boolean(finalId) && Boolean(store.getItem(finalId));

    const create = () => {
        if (!finalId || taken) return;
        store.upsertItem(finalId, itemType, { tags: [] });
        // The name is what lists show; without it the item would appear as its bare id.
        store.setTranslationOverride(finalId, finalId);
        onClose();
        setId("");
        navigate(`/items/${encodeURIComponent(finalId)}`);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Новый предмет</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField
                        label="ItemId"
                        value={id}
                        onChange={(event) => setId(event.target.value)}
                        autoFocus
                        fullWidth
                        error={taken}
                        helperText={
                            taken
                                ? `«${finalId}» уже существует — id должен быть уникальным.`
                                : "Как в таблице: латиницей, без пробелов. Например c_chel_money_1."
                        }
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                create();
                            }
                        }}
                    />

                    <TextField
                        select
                        label="Тип"
                        value={itemType}
                        onChange={(event) => setItemType(event.target.value as ItemKind)}
                        fullWidth
                        helperText="Определяет, в какую таблицу предмет уйдёт при экспорте."
                    >
                        {ITEM_KINDS.map((kind) => (
                            <MenuItem key={kind} value={kind}>
                                {kind}
                            </MenuItem>
                        ))}
                    </TextField>

                    {applied.length > 0 && (
                        <Alert severity="info">
                            Будет создан как <code>{finalId}</code> — сработала проверка id: {applied[0].description}
                            {applied.length > 1 ? ` (+ ещё правил: ${applied.length - 1})` : ""} Отключается в
                            «Настройках текста».
                        </Alert>
                    )}

                    <Alert severity="info">
                        Предмет появится сразу на сайте. В таблицу конфигурации он уйдёт при экспорте на странице
                        «Источники».
                    </Alert>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Отмена</Button>
                <Button variant="contained" disabled={!finalId || taken} onClick={create}>
                    Создать и открыть
                </Button>
            </DialogActions>
        </Dialog>
    );
}
