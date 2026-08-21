import { useState } from "react";
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
import type { DeckSource } from "../../../core/models/Deck";

const SOURCE_LABELS: Record<DeckSource, string> = {
    Decks: "Колоды (таблица Decks)",
    DecksShop: "Колоды магазина (таблица DecksShop)",
};

type Props = {
    open: boolean;

    onClose: () => void;

    /** Fires with the new deck's id once it exists — lets a pack attach it to the source row straight away. */
    onCreated?: (deckId: string) => void;

    /** Which section is preselected. The caller knows the likelier answer better than a fixed default does. */
    defaultSource?: DeckSource;
};

/**
 * Creates an empty deck in the chosen section. Lives here rather than on the Decks page because both callers
 * need it, and the pack one is the reason it exists at all: a deck's section decides which sheet it's exported
 * to, so it has to be picked at creation rather than inferred.
 */
export default function NewDeckDialog({ open, ...rest }: Props) {
    // Mounted only while open, so every opening starts from a clean id/section instead of the last attempt's
    // leftovers — no reset effect needed.
    if (!open) return null;
    return <NewDeckDialogContent {...rest} />;
}

function NewDeckDialogContent({ onClose, onCreated, defaultSource = "DecksShop" }: Omit<Props, "open">) {
    const store = useStore();
    const [id, setId] = useState("");
    const [source, setSource] = useState<DeckSource>(defaultSource);

    const trimmed = id.trim();
    const taken = trimmed !== "" && store.getDeck(trimmed) !== undefined;

    const create = () => {
        if (!trimmed || taken) return;
        store.createDeck(trimmed, source);
        onCreated?.(trimmed);
        onClose();
    };

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Новая колода</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField
                        label="Id колоды"
                        value={id}
                        onChange={(event) => setId(event.target.value)}
                        autoFocus
                        fullWidth
                        error={taken}
                        helperText={taken ? `Колода «${trimmed}» уже есть` : "Как в таблице, например shop_act_1"}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                create();
                            }
                        }}
                    />

                    <TextField
                        select
                        label="Раздел"
                        value={source}
                        onChange={(event) => setSource(event.target.value as DeckSource)}
                        fullWidth
                        helperText="Определяет, в какую таблицу колода уйдёт при экспорте."
                    >
                        {(Object.keys(SOURCE_LABELS) as DeckSource[]).map((key) => (
                            <MenuItem key={key} value={key}>
                                {SOURCE_LABELS[key]}
                            </MenuItem>
                        ))}
                    </TextField>

                    <Alert severity="info">
                        Колода появится сразу на сайте, в своём разделе на странице «Колоды». В таблицу она уйдёт
                        кнопкой «Экспортировать колоды» там же.
                    </Alert>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Отмена</Button>
                <Button variant="contained" disabled={!trimmed || taken} onClick={create}>
                    Создать
                </Button>
            </DialogActions>
        </Dialog>
    );
}
