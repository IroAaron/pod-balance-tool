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

    const decks = store.decks.filter((deck) => deck.source === source);
    const trimmedNewId = newDeckId.trim();
    const alreadyExists = trimmedNewId !== "" && store.getDeck(trimmedNewId) !== undefined;

    const handleCreate = () => {
        if (!trimmedNewId || alreadyExists) return;
        store.createDeck(trimmedNewId, source);
        setNewDeckId("");
    };

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
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
            </Stack>

            {decks.length === 0 && <Typography color="text.secondary">Колод пока нет.</Typography>}

            <Stack spacing={2}>
                {decks.map((deck) => (
                    <DeckCard key={deck.id} deck={deck} />
                ))}
            </Stack>
        </Stack>
    );
}
