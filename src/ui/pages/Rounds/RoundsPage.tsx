import { useMemo, useState } from "react";
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
import ItemIcon from "../../components/ItemIcon";
import ItemDescription from "../../components/ItemDescription";
import { roundAsItemStub } from "./roundAsItemStub";
import type { ExportResult } from "../../../core/import/sheetSource";

export default function RoundsPage() {
    const store = useStore();
    const [query, setQuery] = useState("");
    const [confirmingExport, setConfirmingExport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResult | { ok: false; error: string } | null>(null);

    const confirmExport = async () => {
        setConfirmingExport(false);
        setExporting(true);
        setExportResult(null);
        try {
            setExportResult(await store.exportRoundChanges());
        } catch (error) {
            setExportResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
        } finally {
            setExporting(false);
        }
    };

    const filtered = useMemo(() => {
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) return store.rounds;
        return store.rounds.filter((round) => {
            const name = store.roundName(round).toLowerCase();
            return (
                round.id.toLowerCase().includes(trimmed) ||
                name.includes(trimmed) ||
                (round.rules ?? "").toLowerCase().includes(trimmed)
            );
        });
        // roundName reads live translations at call time — store.translations/store.translationOverrides
        // covers re-running the filter whenever an override changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.rounds, store.translations, store.translationOverrides, query]);

    return (
        <Stack spacing={3}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h4">Раунды</Typography>
                <Button
                    variant="contained"
                    onClick={() => setConfirmingExport(true)}
                    disabled={exporting || store.blueprintRoundPendingExportCount === 0}
                    startIcon={exporting ? <CircularProgress size={16} /> : undefined}
                >
                    {exporting ? "Отправка..." : `Экспортировать раунды (${store.blueprintRoundPendingExportCount})`}
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

            <TextField
                label="Поиск"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                size="small"
                sx={{ maxWidth: 320 }}
            />

            <Typography variant="body2" color="text.secondary">
                Найдено: {filtered.length} из {store.rounds.length}
            </Typography>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 2,
                }}
            >
                {filtered.map((round) => {
                    const artefact = round.invisibleArtefactId ? store.getItem(round.invisibleArtefactId) : undefined;
                    const description = store.roundDescription(round);

                    return (
                        <Card key={round.id} variant="outlined">
                            <CardActionArea
                                component={RouterLink}
                                to={`/rounds/${encodeURIComponent(round.id)}`}
                                sx={{ height: "100%" }}
                            >
                                <CardContent>
                                    <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
                                        {artefact ? (
                                            <ItemIcon item={artefact} size={32} />
                                        ) : (
                                            <Typography sx={{ fontSize: 26, lineHeight: 1 }}>🎯</Typography>
                                        )}
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            {store.roundName(round)}
                                        </Typography>
                                    </Stack>

                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                        {round.id}
                                        {round.rules ? ` · ${round.rules}` : ""}
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
                                            <ItemDescription item={roundAsItemStub(round)} description={description} />
                                        </Typography>
                                    )}
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    );
                })}
            </Box>

            {store.rounds.length === 0 && (
                <Typography color="text.secondary">
                    Данных пока нет — загрузите их на странице «Источники».
                </Typography>
            )}

            <Dialog open={confirmingExport} onClose={() => setConfirmingExport(false)}>
                <DialogTitle>Экспортировать раунды в Google Sheets?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Запишет изменения {store.blueprintRoundPendingExportCount} раунда(ов) обратно в реальную
                        таблицу RoundSettings (RoundRules/AdditionalInvisibleArtefact/TempDeck/DeckBalls по колонке
                        RoundId). Действие необратимо.
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
