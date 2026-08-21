import { useState } from "react";
import {
    Autocomplete,
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
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useStore } from "../../hooks/useStore";
import type { Shop, ShopPackEntry } from "../../../core/models/Shop";
import type { Pack } from "../../../core/models/Pack";

type Props = {
    shop: Shop;

    defaultExpanded?: boolean;
};

type Slot = "housePacks" | "cardPacks";

function newEntryId(slot: Slot): string {
    return `shop-${slot}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** One offer row: which pack, and (card packs only) its draw weight. */
function PackRow({
    entry,
    withWeight,
    onCommit,
    onDelete,
}: {
    entry: ShopPackEntry;
    withWeight: boolean;
    onCommit: (patch: Partial<ShopPackEntry>) => void;
    onDelete: () => void;
}) {
    const store = useStore();
    const [weightText, setWeightText] = useState(entry.weight?.toString() ?? "");
    const selected = store.getPack(entry.packId) ?? null;

    return (
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Autocomplete
                sx={{ flex: 1, minWidth: 280 }}
                size="small"
                options={store.packs}
                value={selected}
                getOptionLabel={(pack: Pack) => `${store.packName(pack)} · ${pack.id}`}
                onChange={(_event, pack) => onCommit({ packId: pack?.id ?? "" })}
                renderInput={(params) => (
                    <TextField {...params} label="Пак" placeholder={entry.packId || undefined} />
                )}
            />

            {withWeight && (
                <TextField
                    label="Вес"
                    type="number"
                    size="small"
                    value={weightText}
                    onChange={(event) => setWeightText(event.target.value)}
                    onBlur={() => onCommit({ weight: weightText.trim() === "" ? undefined : Number(weightText) })}
                    sx={{ width: 110 }}
                />
            )}

            <IconButton aria-label="Убрать пак из магазина" size="small" onClick={onDelete}>
                <CloseIcon fontSize="small" />
            </IconButton>
        </Stack>
    );
}

/**
 * One shop, collapsed by default — same reasoning as DeckCard: each row carries an Autocomplete over every
 * pack, and a shop can hold a dozen of them.
 */
export default function ShopCard({ shop, defaultExpanded = false }: Props) {
    const store = useStore();
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const update = (slot: Slot, entries: ShopPackEntry[]) => {
        const current = store.getShop(shop.id);
        if (!current) return;
        store.upsertShop({ ...current, [slot]: entries });
    };

    const commit = (slot: Slot, entryId: string, patch: Partial<ShopPackEntry>) => {
        const current = store.getShop(shop.id);
        if (!current) return;
        update(slot, current[slot].map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)));
    };

    const remove = (slot: Slot, entryId: string) => {
        const current = store.getShop(shop.id);
        if (!current) return;
        update(slot, current[slot].filter((entry) => entry.id !== entryId));
    };

    const add = (slot: Slot) => {
        const current = store.getShop(shop.id);
        if (!current) return;
        update(slot, [...current[slot], { id: newEntryId(slot), packId: "" }]);
    };

    const section = (slot: Slot, title: string, hint: string, withWeight: boolean) => (
        <Box>
            <Typography variant="subtitle2">{title}</Typography>
            <Typography variant="caption" color="text.secondary">
                {hint}
            </Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
                {shop[slot].map((entry) => (
                    <PackRow
                        key={entry.id}
                        entry={entry}
                        withWeight={withWeight}
                        onCommit={(patch) => commit(slot, entry.id, patch)}
                        onDelete={() => remove(slot, entry.id)}
                    />
                ))}
                {shop[slot].length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        Пусто.
                    </Typography>
                )}
                <Button size="small" onClick={() => add(slot)} sx={{ alignSelf: "flex-start" }}>
                    + Добавить пак
                </Button>
            </Stack>
        </Box>
    );

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                    <IconButton
                        size="small"
                        aria-label={expanded ? "Свернуть магазин" : "Развернуть магазин"}
                        onClick={() => setExpanded((open) => !open)}
                    >
                        {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                    </IconButton>
                    <Box
                        onClick={() => setExpanded((open) => !open)}
                        sx={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: 1 }}
                    >
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {shop.id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            домов: {shop.housePacks.length} · паков челов: {shop.cardPacks.length}
                        </Typography>
                    </Box>
                    <Tooltip title="Удалить магазин">
                        <IconButton
                            aria-label="Удалить магазин"
                            size="small"
                            onClick={() => setConfirmingDelete(true)}
                            sx={{ ml: "auto" }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>

                <Collapse in={expanded} unmountOnExit>
                    <Stack spacing={2.5}>
                        {section("housePacks", "Паки домов", "Колонка HousesInShop. Весов у них в таблице нет.", false)}
                        {section("cardPacks", "Паки челов", "Колонки PacksInShop и PacksWeights.", true)}
                    </Stack>
                </Collapse>
            </Stack>

            <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
                <DialogTitle>Удалить магазин «{shop.id}»?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Магазин пропадёт с сайта сразу, а его строки из ShopSettings — при экспорте магазинов.
                        Раунды, которые на него ссылаются, останутся без магазина.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingDelete(false)}>Отмена</Button>
                    <Button
                        color="error"
                        onClick={() => {
                            store.deleteShop(shop.id);
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
