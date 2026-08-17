import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Card,
    CardActionArea,
    CardContent,
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
import ItemDescription from "../../components/ItemDescription";
import { packAsItemStub } from "./packAsItemStub";
import type { ExportResult } from "../../../core/import/sheetSource";

export default function PacksPage() {
    const store = useStore();
    const [newPackId, setNewPackId] = useState("");
    const [confirmingExport, setConfirmingExport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResult | { ok: false; error: string } | null>(null);

    const trimmedNewId = newPackId.trim();
    const alreadyExists = trimmedNewId !== "" && store.getPack(trimmedNewId) !== undefined;

    const handleCreate = () => {
        if (!trimmedNewId || alreadyExists) return;
        store.createPack(trimmedNewId);
        setNewPackId("");
    };

    const confirmExport = async () => {
        setConfirmingExport(false);
        setExporting(true);
        setExportResult(null);
        try {
            setExportResult(await store.exportPackChanges());
        } catch (error) {
            setExportResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
        } finally {
            setExporting(false);
        }
    };

    return (
        <Stack spacing={3}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h4">Паки</Typography>
                <Button
                    variant="contained"
                    onClick={() => setConfirmingExport(true)}
                    disabled={exporting || store.blueprintPackPendingExportCount === 0}
                    startIcon={exporting ? <CircularProgress size={16} /> : undefined}
                >
                    {exporting ? "Отправка..." : `Экспортировать паки (${store.blueprintPackPendingExportCount})`}
                </Button>
            </Stack>

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

            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                <TextField
                    label="Id нового пака"
                    size="small"
                    value={newPackId}
                    onChange={(event) => setNewPackId(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") handleCreate();
                    }}
                    error={alreadyExists}
                    helperText={alreadyExists ? "Пак с таким id уже есть" : undefined}
                />
                <Button variant="contained" onClick={handleCreate} disabled={!trimmedNewId || alreadyExists}>
                    + Создать пак
                </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary">
                Найдено: {store.packs.length}
            </Typography>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 2,
                }}
            >
                {store.packs.map((pack) => {
                    const description = store.packDescription(pack);
                    const summary = [
                        pack.cost !== undefined ? `Цена: ${pack.cost}` : null,
                        pack.itemsToTake !== undefined ? `Взять: ${pack.itemsToTake}` : null,
                        `Источников: ${pack.sources.length}`,
                    ]
                        .filter(Boolean)
                        .join(" · ");

                    return (
                        <Card key={pack.id} variant="outlined">
                            <CardActionArea
                                component={RouterLink}
                                to={`/packs/${encodeURIComponent(pack.id)}`}
                                sx={{ height: "100%" }}
                            >
                                <CardContent>
                                    <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
                                        <Typography sx={{ fontSize: 26, lineHeight: 1 }}>🎁</Typography>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            {store.packName(pack)}
                                        </Typography>
                                    </Stack>

                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                        {pack.id}
                                    </Typography>

                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                        {summary}
                                    </Typography>

                                    {description && (
                                        <Typography
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{
                                                display: "-webkit-box",
                                                WebkitLineClamp: 3,
                                                WebkitBoxOrient: "vertical",
                                                overflow: "hidden",
                                            }}
                                        >
                                            <ItemDescription item={packAsItemStub(pack)} description={description} />
                                        </Typography>
                                    )}
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    );
                })}
            </Box>

            {store.packs.length === 0 && (
                <Typography color="text.secondary">
                    Данных пока нет — загрузите их на странице «Источники».
                </Typography>
            )}

            <Dialog open={confirmingExport} onClose={() => setConfirmingExport(false)}>
                <DialogTitle>Экспортировать паки в Google Sheets?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Запишет изменения {store.blueprintPackPendingExportCount} пака(ов) обратно в реальную таблицу
                        Packs (по колонке PackId — все строки этого пака заменяются текущими параметрами и
                        источниками). Названия/описания паков экспортируются отдельно, через «Экспортировать правки»
                        на странице «Источники». Действие необратимо.
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
