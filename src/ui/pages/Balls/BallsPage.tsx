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
import { ballAsItemStub } from "./ballAsItemStub";
import type { ExportResult } from "../../../core/import/sheetSource";

export default function BallsPage() {
    const store = useStore();
    const [newBallId, setNewBallId] = useState("");
    const [confirmingExport, setConfirmingExport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResult | { ok: false; error: string } | null>(null);

    const trimmedNewId = newBallId.trim();
    const alreadyExists = trimmedNewId !== "" && store.getBall(trimmedNewId) !== undefined;

    const handleCreate = () => {
        if (!trimmedNewId || alreadyExists) return;
        store.createBall(trimmedNewId);
        setNewBallId("");
    };

    const confirmExport = async () => {
        setConfirmingExport(false);
        setExporting(true);
        setExportResult(null);
        try {
            setExportResult(await store.exportBallChanges());
        } catch (error) {
            setExportResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
        } finally {
            setExporting(false);
        }
    };

    return (
        <Stack spacing={3}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h4">Шары</Typography>
                <Button
                    variant="contained"
                    onClick={() => setConfirmingExport(true)}
                    disabled={exporting || store.blueprintBallPendingExportCount === 0}
                    startIcon={exporting ? <CircularProgress size={16} /> : undefined}
                >
                    {exporting ? "Отправка..." : `Экспортировать шары (${store.blueprintBallPendingExportCount})`}
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
                    label="Id нового шара"
                    size="small"
                    value={newBallId}
                    onChange={(event) => setNewBallId(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") handleCreate();
                    }}
                    error={alreadyExists}
                    helperText={alreadyExists ? "Шар с таким id уже есть" : undefined}
                />
                <Button variant="contained" onClick={handleCreate} disabled={!trimmedNewId || alreadyExists}>
                    + Создать шар
                </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary">
                Найдено: {store.balls.length}
            </Typography>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 2,
                }}
            >
                {store.balls.map((ball) => {
                    const description = store.ballDescription(ball);
                    const summary = [
                        ball.runMin !== undefined && ball.runMax !== undefined
                            ? `Run: ${ball.runMin}–${ball.runMax}`
                            : null,
                        ball.valueMin !== undefined && ball.valueMax !== undefined
                            ? `Value: ${ball.valueMin}–${ball.valueMax}`
                            : null,
                        ball.color ? `Color: ${ball.color}` : null,
                    ]
                        .filter(Boolean)
                        .join(" · ");

                    return (
                        <Card key={ball.id} variant="outlined">
                            <CardActionArea
                                component={RouterLink}
                                to={`/balls/${encodeURIComponent(ball.id)}`}
                                sx={{ height: "100%" }}
                            >
                                <CardContent>
                                    <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
                                        <Typography sx={{ fontSize: 26, lineHeight: 1 }}>🎱</Typography>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            {store.ballName(ball)}
                                        </Typography>
                                    </Stack>

                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                        {ball.id}
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
                                            <ItemDescription item={ballAsItemStub(ball)} description={description} />
                                        </Typography>
                                    )}
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    );
                })}
            </Box>

            {store.balls.length === 0 && (
                <Typography color="text.secondary">
                    Данных пока нет — загрузите их на странице «Источники».
                </Typography>
            )}

            <Dialog open={confirmingExport} onClose={() => setConfirmingExport(false)}>
                <DialogTitle>Экспортировать шары в Google Sheets?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Запишет изменения {store.blueprintBallPendingExportCount} шара(ов) обратно в реальную таблицу
                        Balls (по колонке ItemId — существующие строки обновятся, новых — добавятся). Названия/описания
                        шаров экспортируются отдельно, через «Экспортировать правки» на странице «Источники».
                        Действие необратимо.
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
