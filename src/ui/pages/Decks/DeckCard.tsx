import { useState } from "react";
import {
    Box,
    Button,
    Collapse,
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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useStore } from "../../hooks/useStore";
import DeckEntriesEditor from "./DeckEntriesEditor";
import DeckNameField from "./DeckNameField";
import type { Deck } from "../../../core/models/Deck";

type Props = {
    deck: Deck;

    defaultExpanded?: boolean;
};

/**
 * A deck, collapsed by default.
 *
 * DecksShop holds 355 rows across 21 decks, and each row carries an Autocomplete over all ~320 items; rendering
 * every deck's rows at once is what made that tab crawl. Collapsed cards cost nothing, and 21 of them is a far
 * more usable list than one 355-row wall anyway.
 */
export default function DeckCard({ deck, defaultExpanded = false }: Props) {
    const store = useStore();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                    <IconButton
                        size="small"
                        aria-label={expanded ? "Свернуть колоду" : "Развернуть колоду"}
                        onClick={() => setExpanded((open) => !open)}
                    >
                        {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                    </IconButton>
                    <Box
                        onClick={() => setExpanded((open) => !open)}
                        sx={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: 1 }}
                    >
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {deck.id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            предметов: {deck.entries.length}
                        </Typography>
                    </Box>
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

                {/* unmountOnExit, not just hidden: the whole point is to keep collapsed rows out of the tree. */}
                <Collapse in={expanded} unmountOnExit>
                    <DeckEntriesEditor deckId={deck.id} />
                </Collapse>
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
