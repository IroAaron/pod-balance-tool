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
import type { ExportResult } from "../../../core/import/sheetSource";

export default function SprintsPage() {
    const store = useStore();
    const [newSprintId, setNewSprintId] = useState("");
    const [confirmingExport, setConfirmingExport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResult | { ok: false; error: string } | null>(null);

    const trimmedNewId = newSprintId.trim();
    const alreadyExists = trimmedNewId !== "" && store.getSprint(trimmedNewId) !== undefined;

    const handleCreate = () => {
        if (!trimmedNewId || alreadyExists) return;
        store.createSprint(trimmedNewId);
        setNewSprintId("");
    };

    const confirmExport = async () => {
        setConfirmingExport(false);
        setExporting(true);
        setExportResult(null);
        try {
            setExportResult(await store.exportSprintChanges());
        } catch (error) {
            setExportResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
        } finally {
            setExporting(false);
        }
    };

    return (
        <Stack spacing={3}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h4">Забеги</Typography>
                <Button
                    variant="contained"
                    onClick={() => setConfirmingExport(true)}
                    disabled={exporting || store.blueprintSprintPendingExportCount === 0}
                    startIcon={exporting ? <CircularProgress size={16} /> : undefined}
                >
                    {exporting ? "Отправка..." : `Экспортировать забеги (${store.blueprintSprintPendingExportCount})`}
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
                    label="Id нового забега"
                    size="small"
                    value={newSprintId}
                    onChange={(event) => setNewSprintId(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") handleCreate();
                    }}
                    error={alreadyExists}
                    helperText={alreadyExists ? "Забег с таким id уже есть" : undefined}
                />
                <Button variant="contained" onClick={handleCreate} disabled={!trimmedNewId || alreadyExists}>
                    + Создать забег
                </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary">
                Найдено: {store.sprints.length}
            </Typography>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 2,
                }}
            >
                {store.sprints.map((sprint) => {
                    const stageCount = store.getSprintStageCount(sprint.id);
                    return (
                        <Card key={sprint.id} variant="outlined">
                            <CardActionArea
                                component={RouterLink}
                                to={`/sprints/${encodeURIComponent(sprint.id)}`}
                                sx={{ height: "100%" }}
                            >
                                <CardContent>
                                    <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
                                        <Typography sx={{ fontSize: 26, lineHeight: 1 }}>🏃</Typography>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            {sprint.id}
                                        </Typography>
                                    </Stack>

                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                        Раундов: {sprint.rounds.length} · Этапов: {stageCount}
                                    </Typography>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    );
                })}
            </Box>

            {store.sprints.length === 0 && (
                <Typography color="text.secondary">
                    Данных пока нет — загрузите их на странице «Источники».
                </Typography>
            )}

            <Dialog open={confirmingExport} onClose={() => setConfirmingExport(false)}>
                <DialogTitle>Экспортировать забеги в Google Sheets?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Запишет изменения {store.blueprintSprintPendingExportCount} забега(ов) обратно в реальную
                        таблицу Sprints (по колонке SprintId — все строки этого забега заменяются текущим набором
                        раундов, порядок строк определяет RoundNumber). Действие необратимо.
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
