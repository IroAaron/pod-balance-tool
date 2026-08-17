import { memo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Autocomplete, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
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

/** One pack source-deck entry — same row shape as DeckEntryRow: a deck Autocomplete (searches BOTH Decks and
 *  DecksShop, per the user's "сюда идут id из любой колоды") commits immediately on selection, ItemNumber/
 *  ItemCount/ItemWeight/ItemCost commit on blur (blank -> undefined, matching parseOptionalNumber's convention). */
const PackSourceRow = memo(function PackSourceRow({ entry, onCommit, onDelete }: Props) {
    const store = useStore();
    const [itemNumberText, setItemNumberText] = useState(entry.itemNumber?.toString() ?? "");
    const [itemCountText, setItemCountText] = useState(entry.itemCount?.toString() ?? "");
    const [itemWeightText, setItemWeightText] = useState(entry.itemWeight?.toString() ?? "");
    const [itemCostText, setItemCostText] = useState(entry.itemCost?.toString() ?? "");

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
        <Stack spacing={0.5}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
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

            {selectedDeck &&
                (deckItems.length > 0 ? (
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", pl: 1 }}>
                        {deckItems.map((item) => (
                            <Tooltip key={item.id} title={store.itemName(item)}>
                                <span>
                                    <ItemIcon item={item} size={22} />
                                </span>
                            </Tooltip>
                        ))}
                    </Stack>
                ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                        В колоде пока нет предметов.
                    </Typography>
                ))}
        </Stack>
    );
});

export default PackSourceRow;
