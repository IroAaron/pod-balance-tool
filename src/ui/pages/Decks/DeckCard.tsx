import { useState } from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useStore } from "../../hooks/useStore";
import DeckEntryRow from "./DeckEntryRow";
import DeckNameField from "./DeckNameField";
import type { Deck, DeckEntry } from "../../../core/models/Deck";

type Props = {
    deck: Deck;
};

export default function DeckCard({ deck }: Props) {
    const store = useStore();
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const updateEntries = (nextEntries: DeckEntry[]) => {
        store.upsertDeck({ ...deck, entries: nextEntries });
    };

    const handleRowCommit = (id: string, patch: { itemId: string; weight?: number; cost?: number }) => {
        updateEntries(deck.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    };

    const handleRowDelete = (id: string) => {
        updateEntries(deck.entries.filter((entry) => entry.id !== id));
    };

    const handleAddEntry = () => {
        updateEntries([
            ...deck.entries,
            { id: `deck-entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, itemId: "" },
        ]);
    };

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {deck.id}
                    </Typography>
                    <DeckNameField deckId={deck.id} />
                    <IconButton
                        aria-label="Удалить колоду"
                        size="small"
                        onClick={() => setConfirmingDelete(true)}
                        sx={{ ml: "auto" }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Stack>

                <Stack spacing={1}>
                    {deck.entries.map((entry) => (
                        <DeckEntryRow
                            key={entry.id}
                            entry={entry}
                            onCommit={handleRowCommit}
                            onDelete={handleRowDelete}
                        />
                    ))}
                </Stack>

                {deck.entries.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        Пока нет предметов.
                    </Typography>
                )}

                <Button size="small" onClick={handleAddEntry} sx={{ alignSelf: "flex-start" }}>
                    + Добавить предмет
                </Button>
            </Stack>

            <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
                <DialogTitle>Удалить колоду «{deck.id}»?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Колода будет удалена с сайта сразу. В реальной таблице ({deck.source}) её строки
                        удалятся только после экспорта колод.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingDelete(false)}>Отмена</Button>
                    <Button
                        color="error"
                        onClick={() => {
                            store.deleteDeck(deck.id);
                            setConfirmingDelete(false);
                        }}
                    >
                        Удалить
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}
