import { useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";

export default function SourcesPage() {
    const store = useStore();
    const [configUrl, setConfigUrl] = useState(store.sources.configUrl);
    const [translationsUrl, setTranslationsUrl] = useState(store.sources.translationsUrl);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownload = () => {
        void store.importFromSources({ configUrl, translationsUrl });
    };

    const handleFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        void store.importCsvFiles(Array.from(files));
    };

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Typography variant="h4">Источники</Typography>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Google Sheets / Apps Script</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Ссылка на Google Sheets скачивает одну вкладку (CSV). Ссылка на Apps Script Web App
                        должна возвращать JSON вида {"{ [имяВкладки]: [{ ...строка }] }"} — так одна ссылка
                        покрывает сразу несколько таблиц (Items, переводы, механики).
                    </Typography>

                    <TextField
                        label="Источник конфигурации"
                        placeholder="https://docs.google.com/spreadsheets/... или Apps Script URL"
                        value={configUrl}
                        onChange={(event) => setConfigUrl(event.target.value)}
                        fullWidth
                        size="small"
                    />

                    <TextField
                        label="Источник переводов"
                        placeholder="https://docs.google.com/spreadsheets/... или Apps Script URL"
                        value={translationsUrl}
                        onChange={(event) => setTranslationsUrl(event.target.value)}
                        fullWidth
                        size="small"
                    />

                    <Box>
                        <Button
                            variant="contained"
                            onClick={handleDownload}
                            disabled={store.importing || (!configUrl && !translationsUrl)}
                            startIcon={store.importing ? <CircularProgress size={16} /> : undefined}
                        >
                            {store.importing ? "Скачивание..." : "Скачать"}
                        </Button>
                    </Box>
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">CSV-файлы вручную</Typography>

                    <Box
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(event) => {
                            event.preventDefault();
                            setDragOver(false);
                            handleFiles(event.dataTransfer.files);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        sx={{
                            border: "2px dashed",
                            borderColor: dragOver ? "primary.main" : "divider",
                            borderRadius: 2,
                            p: 4,
                            textAlign: "center",
                            cursor: "pointer",
                            bgcolor: dragOver ? "action.hover" : "transparent",
                        }}
                    >
                        <Typography variant="body2" color="text.secondary">
                            Перетащите CSV-файлы сюда или нажмите, чтобы выбрать. Тип таблицы определяется
                            автоматически по заголовкам столбцов.
                        </Typography>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            multiple
                            hidden
                            onChange={(event) => handleFiles(event.target.files)}
                        />
                    </Box>
                </Stack>
            </Paper>

            {store.importError && <Alert severity="error">{store.importError}</Alert>}

            {store.importReport && (
                <Paper sx={{ p: 3 }}>
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            Результат импорта
                            {store.importedAt && ` — ${new Date(store.importedAt).toLocaleString("ru-RU")}`}
                        </Typography>

                        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                            {store.importReport.tables.map((table, index) => (
                                <Chip
                                    key={`${table.name}-${index}`}
                                    label={`${table.name}: ${table.type} (${table.rowCount})`}
                                    color={table.type === "Unknown" ? "default" : "primary"}
                                    variant="outlined"
                                />
                            ))}
                        </Stack>

                        {store.importReport.warnings.length > 0 && (
                            <Stack spacing={1}>
                                {store.importReport.warnings.map((warning, index) => (
                                    <Alert key={index} severity="warning">
                                        {warning}
                                    </Alert>
                                ))}
                            </Stack>
                        )}

                        <Typography variant="body2" color="text.secondary">
                            Загружено: {store.items.length} предметов, {store.translations.length} переводов,{" "}
                            {store.mechanics.length} строк механик, {store.upgradeChains.length} цепочек прокачки.
                        </Typography>
                    </Stack>
                </Paper>
            )}

            <Divider />

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Резервная копия правок</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Билды, иконки и кастомные значения параметров хранятся в этом браузере. Экспортируйте
                        JSON, чтобы перенести их на другое устройство или сделать бэкап.
                    </Typography>
                    <Stack direction="row" spacing={2}>
                        <Button variant="outlined" onClick={() => store.exportSnapshot()}>
                            Экспортировать
                        </Button>
                        <Button variant="outlined" component="label">
                            Импортировать
                            <input
                                type="file"
                                accept="application/json"
                                hidden
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) void store.importSnapshot(file);
                                    event.target.value = "";
                                }}
                            />
                        </Button>
                    </Stack>
                </Stack>
            </Paper>
        </Stack>
    );
}
