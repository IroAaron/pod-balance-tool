import { useState } from "react";
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ShopCard from "./ShopCard";
import type { ExportResult } from "../../../core/import/sheetSource";

/**
 * «Магазины» — the ShopSettings table.
 *
 * A shop is what a round actually offers: a set of house packs and a set of card packs with draw weights. The
 * round itself only names a shop (its `Shops` column), so several rounds can share one, and a shop can hold
 * more than one house pack — which the old per-round `HousesInShop` column could not.
 */
export default function ShopsPage() {
    const store = useStore();
    const [newShopId, setNewShopId] = useState("");
    const [query, setQuery] = useState("");
    const [confirmingExport, setConfirmingExport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResult | { ok: false; error: string } | null>(null);

    const trimmedNewId = newShopId.trim();
    const alreadyExists = trimmedNewId !== "" && store.getShop(trimmedNewId) !== undefined;

    const handleCreate = () => {
        if (!trimmedNewId || alreadyExists) return;
        store.createShop(trimmedNewId);
        setNewShopId("");
    };

    const confirmExport = async () => {
        setConfirmingExport(false);
        setExporting(true);
        setExportResult(null);
        try {
            setExportResult(await store.exportShopChanges());
        } catch (error) {
            setExportResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
        } finally {
            setExporting(false);
        }
    };

    const needle = query.trim().toLowerCase();
    const filtered = needle ? store.shops.filter((shop) => shop.id.toLowerCase().includes(needle)) : store.shops;

    return (
        <Stack spacing={3}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h4">Магазины</Typography>
                <Button
                    variant="contained"
                    onClick={() => setConfirmingExport(true)}
                    disabled={exporting || store.shopPendingExportCount === 0}
                    startIcon={exporting ? <CircularProgress size={16} /> : undefined}
                >
                    {exporting ? "Отправка..." : `Экспортировать магазины (${store.shopPendingExportCount})`}
                </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary">
                Что лежит в магазине — паки домов и паки челов с весами выпадения. Раунд ссылается на магазин
                колонкой «Shops» в разделе «Забеги».
            </Typography>

            {exportResult &&
                (exportResult.ok ? (
                    <Alert severity="success" onClose={() => setExportResult(null)}>
                        Готово. Обновлено строк:{" "}
                        {Object.entries(exportResult.updated ?? {})
                            .map(([sheet, count]) => `${sheet} — ${count}`)
                            .join(", ") || "0"}
                    </Alert>
                ) : (
                    <Alert severity="error" onClose={() => setExportResult(null)}>
                        {exportResult.error}
                    </Alert>
                ))}

            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                <TextField
                    label="Id нового магазина"
                    size="small"
                    value={newShopId}
                    onChange={(event) => setNewShopId(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") handleCreate();
                    }}
                    error={alreadyExists}
                    helperText={alreadyExists ? "Магазин с таким id уже есть" : undefined}
                />
                <Button variant="contained" onClick={handleCreate} disabled={!trimmedNewId || alreadyExists}>
                    + Создать магазин
                </Button>
                <TextField
                    label="Поиск"
                    size="small"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    sx={{ minWidth: 220 }}
                />
            </Stack>

            {store.shops.length === 0 && (
                <Typography color="text.secondary">
                    Магазинов пока нет — загрузите конфиг на странице «Источники».
                </Typography>
            )}

            {store.shops.length > 0 && filtered.length === 0 && (
                <Typography color="text.secondary">Ничего не найдено по этому запросу.</Typography>
            )}

            <Stack spacing={2}>
                {filtered.map((shop) => (
                    <ShopCard key={shop.id} shop={shop} defaultExpanded={filtered.length === 1} />
                ))}
            </Stack>

            <Dialog open={confirmingExport} onClose={() => setConfirmingExport(false)}>
                <DialogTitle>Экспортировать магазины в Google Sheets?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Запишет изменения {store.shopPendingExportCount} магазин(ов) в таблицу ShopSettings — все
                        строки каждого затронутого ShopId заменяются текущим набором. Действие необратимо.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingExport(false)}>Отмена</Button>
                    <Button color="error" onClick={() => void confirmExport()}>
                        Экспортировать
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
