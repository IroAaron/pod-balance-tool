import { useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import type { ExportResult } from "../../../core/import/sheetSource";

// Пока никто ни разу не жал «Скачать», общих значений в Firestore ещё нет — подставляем боевые ссылки на
// таблицы проекта по умолчанию, чтобы не заставлять первого зашедшего коллегу искать их вручную.
const DEFAULT_CONFIG_URL =
    "https://script.google.com/macros/s/AKfycbzS79EJrv1403Lue7ZASEPTA5ho35kbDh7hh3W01B0npFi_xKoauQS_6Cky5ivmt0Wx/exec";
const DEFAULT_TRANSLATIONS_URL =
    "https://script.google.com/macros/s/AKfycbxALyjgkQxcZYzxoYFipoCJXVrQ9UuE8vydXpWe03ctQ1fYtnrmhG_cpQRTGYeaKJwc/exec";

type SpriteSyncResult = { ok: true; files: number } | { ok: false; error: string };

export default function SourcesPage() {
    const store = useStore();
    const [configUrl, setConfigUrl] = useState(store.sources.configUrl || DEFAULT_CONFIG_URL);
    const [translationsUrl, setTranslationsUrl] = useState(store.sources.translationsUrl || DEFAULT_TRANSLATIONS_URL);
    const [dragOver, setDragOver] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [pendingSnapshotFile, setPendingSnapshotFile] = useState<File | null>(null);
    const [syncingSprites, setSyncingSprites] = useState(false);
    const [spriteSyncResult, setSpriteSyncResult] = useState<SpriteSyncResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [confirmingExport, setConfirmingExport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResult | { ok: false; error: string } | null>(null);

    const handleDownloadConfig = () => {
        void store.importConfig(configUrl);
    };

    const handleDownloadTranslations = () => {
        void store.importTranslations(translationsUrl);
    };

    const handleSyncSprites = async () => {
        setSyncingSprites(true);
        setSpriteSyncResult(null);
        try {
            const response = await fetch("/__sync-sprites", { method: "POST" });
            const body = (await response.json()) as { ok: boolean; files?: number; error?: string };
            setSpriteSyncResult(
                body.ok ? { ok: true, files: body.files ?? 0 } : { ok: false, error: body.error ?? "Неизвестная ошибка" }
            );
        } catch (error) {
            setSpriteSyncResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
        } finally {
            setSyncingSprites(false);
        }
    };

    const handleFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        void store.importCsvFiles(Array.from(files));
    };

    const handleMigrate = async () => {
        setMigrating(true);
        try {
            await store.migrateLegacyData();
        } finally {
            setMigrating(false);
        }
    };

    const confirmSnapshotImport = () => {
        if (!pendingSnapshotFile) return;
        void store.importSnapshot(pendingSnapshotFile);
        setPendingSnapshotFile(null);
    };

    const confirmExport = async () => {
        setConfirmingExport(false);
        setExporting(true);
        setExportResult(null);
        try {
            setExportResult(await store.exportEditedTranslations());
        } catch (error) {
            setExportResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
        } finally {
            setExporting(false);
        }
    };

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Typography variant="h4">Источники</Typography>

            {store.canMigrateLegacyData() && (
                <Alert
                    severity="info"
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => void handleMigrate()}
                            disabled={migrating}
                            startIcon={migrating ? <CircularProgress size={14} color="inherit" /> : undefined}
                        >
                            {migrating ? "Переносим..." : "Перенести"}
                        </Button>
                    }
                >
                    В этом браузере есть билды/иконки из старой версии сайта (хранились локально). Перенести их в
                    общее хранилище, чтобы их видели все коллеги?
                </Alert>
            )}

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Google Sheets / Apps Script</Typography>

                    <Alert severity="info">
                        Конфиг и переводы скачиваются отдельно друг от друга — так можно обновить только одну
                        таблицу, не трогая другую. Ссылки уже подставлены ниже. Повторяйте после каждого изменения
                        соответствующей таблицы в Google Sheets.
                        Если каких-то иконок, данных в объектах сайта не хватает — они либо не загружены, либо не прогружены до конца. Нажмите «Скачать», если после установки проблема через некоторое время не решится, обратитесь к администратору
                    </Alert>

                    <Typography variant="body2" color="text.secondary">
                        Ссылка на Google Sheets скачивает одну вкладку (CSV). Ссылка на Apps Script Web App
                        должна возвращать JSON вида {"{ [имяВкладки]: [{ ...строка }] }"} — так одна ссылка
                        покрывает сразу несколько таблиц (Items, переводы, механики).
                    </Typography>

                    <Stack spacing={1}>
                        <TextField
                            label="Источник конфигурации"
                            placeholder="https://docs.google.com/spreadsheets/... или Apps Script URL"
                            value={configUrl}
                            onChange={(event) => setConfigUrl(event.target.value)}
                            fullWidth
                            size="small"
                        />
                        <Box>
                            <Button
                                variant="contained"
                                onClick={handleDownloadConfig}
                                disabled={store.importing || !configUrl}
                                startIcon={store.importing ? <CircularProgress size={16} /> : undefined}
                            >
                                {store.importing ? "Скачивание..." : "Скачать конфиг"}
                            </Button>
                        </Box>
                    </Stack>

                    <Stack spacing={1}>
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
                                onClick={handleDownloadTranslations}
                                disabled={store.importing || !translationsUrl}
                                startIcon={store.importing ? <CircularProgress size={16} /> : undefined}
                            >
                                {store.importing ? "Скачивание..." : "Скачать переводы"}
                            </Button>
                        </Box>
                    </Stack>
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Экспорт правок в Google Sheets</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Отправляет только названия/описания, отредактированные на сайте (не всю таблицу целиком) —
                        обратно в те же item_name/item_desc по колонке key, в «Источник переводов» выше. Значки
                        глоссария подключаются так же, как сейчас настроено в Настройках (режим описаний и
                        включённые записи); {"{item:ID}"}/{"{tag:Имя}"} всегда превращаются в настоящие ссылки.
                        Требует доработки Apps Script (см. <code>docs/apps-script-export.gs</code>) и
                        <code> VITE_SHEETS_EXPORT_TOKEN</code> в <code>.env.local</code>.
                    </Typography>

                    <Box>
                        <Button
                            variant="contained"
                            onClick={() => setConfirmingExport(true)}
                            disabled={exporting || store.pendingExportCount === 0}
                            startIcon={exporting ? <CircularProgress size={16} /> : undefined}
                        >
                            {exporting
                                ? "Отправка..."
                                : `Экспортировать правки (${store.pendingExportCount})`}
                        </Button>
                    </Box>

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

            {import.meta.env.DEV && (
                <Paper sx={{ p: 3 }}>
                    <Stack spacing={2}>
                        <Typography variant="h6">Спрайты (только локальная разработка)</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Подгружает папку <code>roulette_interface</code> из репозитория игры (
                            <code>KlukvaGames/preess-or-die</code>, ветка <code>gun2</code>) в <code>public/</code> —
                            то же самое, что при деплое делает CI, только по кнопке и сразу видно локально. Нужен
                            <code> SPRITE_REPO_TOKEN</code> в <code>.env.local</code> (см. <code>.env.example</code>
                            ). Эта кнопка не появляется на задеплоенном сайте — она есть только пока запущен{" "}
                            <code>npm run dev</code>.
                        </Typography>

                        <Box>
                            <Button
                                variant="outlined"
                                onClick={() => void handleSyncSprites()}
                                disabled={syncingSprites}
                                startIcon={syncingSprites ? <CircularProgress size={16} /> : undefined}
                            >
                                {syncingSprites ? "Подгружаем..." : "Подгрузить спрайты из репозитория игры"}
                            </Button>
                        </Box>

                        {spriteSyncResult &&
                            (spriteSyncResult.ok ? (
                                <Alert severity="success" onClose={() => setSpriteSyncResult(null)}>
                                    Готово — обновлено файлов: {spriteSyncResult.files}. Обновите страницу, если
                                    иконки где-то ещё не подхватились.
                                </Alert>
                            ) : (
                                <Alert severity="error" onClose={() => setSpriteSyncResult(null)}>
                                    {spriteSyncResult.error}
                                </Alert>
                            ))}
                    </Stack>
                </Paper>
            )}

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
                    <Typography variant="h6">Резервная копия</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Билды, иконки и кастомные значения параметров общие для всех и хранятся в Firestore.
                        Экспортируйте JSON для бэкапа/отладки; импорт снапшота перезапишет общие данные для всех.
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
                                    if (file) setPendingSnapshotFile(file);
                                    event.target.value = "";
                                }}
                            />
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            <Dialog open={pendingSnapshotFile !== null} onClose={() => setPendingSnapshotFile(null)}>
                <DialogTitle>Импортировать снапшот?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Это перезапишет общие билды, иконки, кастомные значения параметров и источники для всех
                        коллег данными из файла «{pendingSnapshotFile?.name}». Действие необратимо.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPendingSnapshotFile(null)}>Отмена</Button>
                    <Button color="error" onClick={confirmSnapshotImport}>
                        Импортировать
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmingExport} onClose={() => setConfirmingExport(false)}>
                <DialogTitle>Экспортировать правки в Google Sheets?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Запишет {store.pendingExportCount} отредактированных на сайте названий/описаний обратно в
                        реальные таблицы item_name/item_desc (по колонке key — существующие строки обновятся,
                        новых ключей — добавятся). Действие необратимо.
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
