import { Button, Stack, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import DeckEntryRow from "./DeckEntryRow";

type Props = {
    deckId: string;
};

/**
 * The item rows of one deck, and nothing else. Extracted from DeckCard so a pack can edit its source deck
 * in place — the whole point of the pack-side editor is not having to leave for «Колоды» and come back.
 *
 * Takes a deck *id* rather than the deck object so the row callbacks can stay referentially stable: a deck
 * changes identity on every edit, and a callback closing over it would defeat DeckEntryRow's memo and re-render
 * all 51 rows of the biggest shop deck on every keystroke. Each one re-reads the current deck from the store,
 * leaving `store` and `deckId` — both stable — as the only things they close over.
 */
export default function DeckEntriesEditor({ deckId }: Props) {
    const store = useStore();
    const deck = store.getDeck(deckId);

    const handleRowCommit = (id: string, patch: { itemId: string; weight?: number; cost?: number }) => {
        const current = store.getDeck(deckId);
        if (!current) return;
        store.upsertDeck({
            ...current,
            entries: current.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
        });
    };

    const handleRowDelete = (id: string) => {
        const current = store.getDeck(deckId);
        if (!current) return;
        store.upsertDeck({ ...current, entries: current.entries.filter((entry) => entry.id !== id) });
    };

    const handleAddEntry = () => {
        const current = store.getDeck(deckId);
        if (!current) return;
        store.upsertDeck({
            ...current,
            entries: [
                ...current.entries,
                { id: `deck-entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, itemId: "" },
            ],
        });
    };

    if (!deck) {
        return (
            <Typography variant="body2" color="text.secondary">
                Колода не найдена.
            </Typography>
        );
    }

    return (
        <Stack spacing={1}>
            {deck.entries.map((entry) => (
                <DeckEntryRow key={entry.id} entry={entry} onCommit={handleRowCommit} onDelete={handleRowDelete} />
            ))}

            {deck.entries.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    Пока нет предметов.
                </Typography>
            )}

            <Button size="small" onClick={handleAddEntry} sx={{ alignSelf: "flex-start" }}>
                + Добавить предмет
            </Button>
        </Stack>
    );
}
