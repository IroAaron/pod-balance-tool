import { useState } from "react";
import { Button, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import DeckCard from "./DeckCard";
import type { DeckSource } from "../../../core/models/Deck";

type Props = {
    source: DeckSource;
};

export default function DeckList({ source }: Props) {
    const store = useStore();
    const [newDeckId, setNewDeckId] = useState("");
    const [query, setQuery] = useState("");

    const decks = store.decks.filter((deck) => deck.source === source);
    const trimmedNewId = newDeckId.trim();
    const alreadyExists = trimmedNewId !== "" && store.getDeck(trimmedNewId) !== undefined;

    const handleCreate = () => {
        if (!trimmedNewId || alreadyExists) return;
        store.createDeck(trimmedNewId, source);
        setNewDeckId("");
    };

    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
        ? decks.filter(
              (deck) =>
                  deck.id.toLowerCase().includes(normalizedQuery) ||
                  (store.getDeckName(deck.id) ?? "").toLowerCase().includes(normalizedQuery)
          )
        : decks;

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                <TextField
                    label="Id новой колоды"
                    size="small"
                    value={newDeckId}
                    onChange={(event) => setNewDeckId(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") handleCreate();
                    }}
                    error={alreadyExists}
                    helperText={alreadyExists ? "Колода с таким id уже есть" : undefined}
                />
                <Button variant="contained" onClick={handleCreate} disabled={!trimmedNewId || alreadyExists}>
                    + Создать колоду
                </Button>
                <TextField
                    label="Поиск (id или название)"
                    size="small"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    sx={{ minWidth: 240 }}
                />
            </Stack>

            {decks.length === 0 && <Typography color="text.secondary">Колод пока нет.</Typography>}

            {decks.length > 0 && filtered.length === 0 && (
                <Typography color="text.secondary">Ничего не найдено по этому запросу.</Typography>
            )}

            <Stack spacing={2}>
                {filtered.map((deck) => (
                    <DeckCard key={deck.id} deck={deck} />
                ))}
            </Stack>
        </Stack>
    );
}
