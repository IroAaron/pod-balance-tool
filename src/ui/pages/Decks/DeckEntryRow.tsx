import { memo, useMemo, useState } from "react";
import { Autocomplete, Box, createFilterOptions, IconButton, Stack, TextField, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import DetailModal from "../../components/DetailModal";
import ItemDetailPage from "../Items/ItemDetailPage";
import type { DeckEntry } from "../../../core/models/Deck";
import type { Item } from "../../../core/models/Item";

type Props = {
    entry: DeckEntry;

    onCommit: (id: string, patch: { itemId: string; weight?: number; cost?: number }) => void;

    onDelete: (id: string) => void;
};

/** One deck entry row — item Autocomplete (reuses the same store.items search shown in IconTokenInsertButton's
 *  "Предмет" tab) commits immediately on selection (discrete action), Weight/Cost commit on blur like
 *  TagIconsTab's rows (blank -> undefined, not 0, matching parseOptionalNumber's convention). */
const DeckEntryRow = memo(function DeckEntryRow({ entry, onCommit, onDelete }: Props) {
    const store = useStore();
    const [weightText, setWeightText] = useState(entry.weight?.toString() ?? "");
    const [costText, setCostText] = useState(entry.cost?.toString() ?? "");
    const [detailOpen, setDetailOpen] = useState(false);

    const selectedItem = store.getItem(entry.itemId) ?? null;

    // Displayed label deliberately omits the id (per user request — names read easier in a long deck list); id
    // still matches via filterOptions below so searching by a known id keeps working.
    const filterOptions = useMemo(
        () => createFilterOptions<Item>({ stringify: (item) => `${store.itemName(item)} ${item.id}` }),
        [store]
    );

    const commitWeightCost = () => {
        onCommit(entry.id, {
            itemId: entry.itemId,
            weight: weightText.trim() === "" ? undefined : Number(weightText),
            cost: costText.trim() === "" ? undefined : Number(costText),
        });
    };

    const handleItemChange = (item: Item | null) => {
        onCommit(entry.id, { itemId: item?.id ?? "", weight: entry.weight, cost: entry.cost });
    };

    return (
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selectedItem && (
                    <Tooltip title={store.itemName(selectedItem)}>
                        <Box
                            onClick={() => setDetailOpen(true)}
                            sx={{ display: "flex", lineHeight: 0, cursor: "pointer" }}
                        >
                            <ItemIcon item={selectedItem} size={28} />
                        </Box>
                    </Tooltip>
                )}
            </Box>

            {/* Mounted only while open — one Dialog per row adds up fast in a 51-row deck. */}
            {detailOpen && selectedItem && (
                <DetailModal open onClose={() => setDetailOpen(false)}>
                    <ItemDetailPage id={selectedItem.id} />
                </DetailModal>
            )}

            <Autocomplete
                sx={{ flex: 1, minWidth: 260 }}
                size="small"
                options={store.items}
                value={selectedItem}
                getOptionLabel={(item) => store.itemName(item)}
                filterOptions={filterOptions}
                renderOption={(props, item) => (
                    <Stack component="li" {...props} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <ItemIcon item={item} size={24} />
                        <span>{store.itemName(item)}</span>
                    </Stack>
                )}
                onChange={(_event, item) => handleItemChange(item)}
                renderInput={(params) => (
                    <TextField {...params} label="Предмет" placeholder={entry.itemId || undefined} />
                )}
            />

            <TextField
                label="Вес"
                type="number"
                size="small"
                value={weightText}
                onChange={(event) => setWeightText(event.target.value)}
                onBlur={commitWeightCost}
                sx={{ width: 100 }}
            />

            <TextField
                label="Стоимость"
                type="number"
                size="small"
                value={costText}
                onChange={(event) => setCostText(event.target.value)}
                onBlur={commitWeightCost}
                sx={{ width: 100 }}
            />

            <IconButton aria-label="Удалить предмет из колоды" size="small" onClick={() => onDelete(entry.id)}>
                <CloseIcon fontSize="small" />
            </IconButton>
        </Stack>
    );
});

export default DeckEntryRow;
