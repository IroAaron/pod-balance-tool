import { memo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
    Autocomplete,
    Box,
    Chip,
    Collapse,
    IconButton,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import DeckEntriesEditor from "../Decks/DeckEntriesEditor";
import DeckNameField from "../Decks/DeckNameField";
import NewDeckDialog from "../Decks/NewDeckDialog";
import type { PackSourceEntry } from "../../../core/models/Pack";
import type { Deck } from "../../../core/models/Deck";

/** DeckSource -> DecksPage's own TabKey (not exported from there — just two known string literals). */
const DECK_SOURCE_TO_TAB: Record<Deck["source"], string> = {
    Decks: "decks",
    DecksShop: "decksShop",
};

type Props = {
    entry: PackSourceEntry;

    onCommit: (id: string, patch: Partial<PackSourceEntry>) => void;

    onDelete: (id: string) => void;
};

/**
 * One pack source-deck entry — a deck Autocomplete (searches BOTH Decks and DecksShop, per the user's "сюда идут
 * id из любой колоды") commits immediately on selection, ItemNumber/ItemCount/ItemWeight/ItemCost commit on blur
 * (blank -> undefined, matching parseOptionalNumber's convention).
 *
 * The deck can also be created and filled in without leaving the pack: «+» makes a new empty deck in whichever
 * section is chosen and attaches it here, and the chevron opens that deck's own item editor inline. Going to
 * «Колоды» and back for every source was the whole complaint.
 */
const PackSourceRow = memo(function PackSourceRow({ entry, onCommit, onDelete }: Props) {
    const store = useStore();
    const [itemNumberText, setItemNumberText] = useState(entry.itemNumber?.toString() ?? "");
    const [itemCountText, setItemCountText] = useState(entry.itemCount?.toString() ?? "");
    const [itemWeightText, setItemWeightText] = useState(entry.itemWeight?.toString() ?? "");
    const [itemCostText, setItemCostText] = useState(entry.itemCost?.toString() ?? "");
    const [expanded, setExpanded] = useState(false);
    const [creatingDeck, setCreatingDeck] = useState(false);

    const selectedDeck = store.getDeck(entry.sourceDeckId) ?? null;

    // One icon per distinct item in the source deck (repeated itemIds — real data, see Deck.entries' own doc —
    // collapse to a single icon here, since this is just "what's in here", not a weighted preview).
    const deckItems = selectedDeck
        ? [...new Set(selectedDeck.entries.map((deckEntry) => deckEntry.itemId).filter(Boolean))]
              .map((itemId) => store.getItem(itemId))
              .filter((item): item is NonNullable<typeof item> => Boolean(item))
        : [];

    const commitNumbers = () => {
        onCommit(entry.id, {
            itemNumber: itemNumberText.trim() === "" ? undefined : Number(itemNumberText),
            itemCount: itemCountText.trim() === "" ? undefined : Number(itemCountText),
            itemWeight: itemWeightText.trim() === "" ? undefined : Number(itemWeightText),
            itemCost: itemCostText.trim() === "" ? undefined : Number(itemCostText),
        });
    };

    const handleDeckChange = (deck: Deck | null) => {
        onCommit(entry.id, { sourceDeckId: deck?.id ?? "" });
    };

    return (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <IconButton
                    size="small"
                    aria-label={expanded ? "Свернуть колоду" : "Развернуть колоду"}
                    disabled={!selectedDeck}
                    onClick={() => setExpanded((open) => !open)}
                >
                    {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                </IconButton>

                <Autocomplete
                    sx={{ flex: 1, minWidth: 260 }}
                    size="small"
                    options={store.decks}
                    value={selectedDeck}
                    getOptionLabel={(deck) => `${deck.id} (${deck.source})`}
                    onChange={(_event, deck) => handleDeckChange(deck)}
                    renderInput={(params) => (
                        <TextField {...params} label="Колода-источник" placeholder={entry.sourceDeckId || undefined} />
                    )}
                />

                <TextField
                    label="ItemNumber"
                    type="number"
                    size="small"
                    value={itemNumberText}
                    onChange={(event) => setItemNumberText(event.target.value)}
                    onBlur={commitNumbers}
                    sx={{ width: 110 }}
                />

                <TextField
                    label="ItemCount"
                    type="number"
                    size="small"
                    value={itemCountText}
                    onChange={(event) => setItemCountText(event.target.value)}
                    onBlur={commitNumbers}
                    sx={{ width: 110 }}
                />

                <TextField
                    label="ItemWeight"
                    type="number"
                    size="small"
                    value={itemWeightText}
                    onChange={(event) => setItemWeightText(event.target.value)}
                    onBlur={commitNumbers}
                    sx={{ width: 110 }}
                />

                <TextField
                    label="ItemCost"
                    type="number"
                    size="small"
                    value={itemCostText}
                    onChange={(event) => setItemCostText(event.target.value)}
                    onBlur={commitNumbers}
                    sx={{ width: 110 }}
                />

                <Tooltip title="Создать новую колоду и подставить сюда">
                    <IconButton
                        aria-label="Создать новую колоду"
                        size="small"
                        onClick={() => setCreatingDeck(true)}
                    >
                        <AddIcon fontSize="small" />
                    </IconButton>
                </Tooltip>

                {selectedDeck && (
                    <Tooltip title="Найти эту колоду на странице «Колоды»">
                        <IconButton
                            aria-label="Найти колоду-источник в колодах"
                            size="small"
                            component={RouterLink}
                            to={`/decks?tab=${DECK_SOURCE_TO_TAB[selectedDeck.source]}&search=${encodeURIComponent(selectedDeck.id)}`}
                        >
                            <OpenInNewIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}

                <IconButton aria-label="Удалить источник" size="small" onClick={() => onDelete(entry.id)}>
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Stack>

            {selectedDeck && !expanded && (
                <Box sx={{ pl: 5, pt: 0.5 }}>
                    {deckItems.length > 0 ? (
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                            {deckItems.map((item) => (
                                <Tooltip key={item.id} title={store.itemName(item)}>
                                    <span>
                                        <ItemIcon item={item} size={22} />
                                    </span>
                                </Tooltip>
                            ))}
                        </Stack>
                    ) : (
                        <Typography variant="caption" color="text.secondary">
                            В колоде пока нет предметов.
                        </Typography>
                    )}
                </Box>
            )}

            {/* unmountOnExit so a collapsed source costs nothing — a shop deck can be 51 Autocomplete rows. */}
            <Collapse in={expanded && Boolean(selectedDeck)} unmountOnExit>
                {selectedDeck && (
                    <Stack spacing={1} sx={{ pl: 5, pt: 1.5 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                            <Chip
                                label={selectedDeck.source === "Decks" ? "Колоды" : "Колоды магазина"}
                                size="small"
                                variant="outlined"
                            />
                            <DeckNameField deckId={selectedDeck.id} />
                        </Stack>
                        <DeckEntriesEditor deckId={selectedDeck.id} />
                    </Stack>
                )}
            </Collapse>

            <NewDeckDialog
                open={creatingDeck}
                onClose={() => setCreatingDeck(false)}
                onCreated={(deckId) => {
                    onCommit(entry.id, { sourceDeckId: deckId });
                    // A deck made from here is empty by definition, so open it ready to be filled.
                    setExpanded(true);
                }}
            />
        </Paper>
    );
});

export default PackSourceRow;
