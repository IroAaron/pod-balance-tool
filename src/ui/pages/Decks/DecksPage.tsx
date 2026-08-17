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
    Tab,
    Tabs,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import type { ExportResult } from "../../../core/import/sheetSource";
import DeckList from "./DeckList";
import BallGroupList from "./BallGroupList";

type TabKey = "decks" | "decksShop" | "ballGroups";

export default function DecksPage() {
    const store = useStore();
    const [tab, setTab] = useState<TabKey>("decks");
    const [confirmingExport, setConfirmingExport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<ExportResult | { ok: false; error: string } | null>(null);

    const confirmExport = async () => {
        setConfirmingExport(false);
        setExporting(true);
        setExportResult(null);
        try {
            setExportResult(await store.exportDeckChanges());
        } catch (error) {
            setExportResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
        } finally {
            setExporting(false);
        }
    };

    return (
        <Stack spacing={3}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h4">Колоды</Typography>
                <Button
                    variant="contained"
                    onClick={() => setConfirmingExport(true)}
                    disabled={exporting || store.blueprintDeckPendingExportCount === 0}
                    startIcon={exporting ? <CircularProgress size={16} /> : undefined}
                >
                    {exporting ? "Отправка..." : `Экспортировать колоды (${store.blueprintDeckPendingExportCount})`}
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

            <Tabs value={tab} onChange={(_event, next: TabKey) => setTab(next)}>
                <Tab value="decks" label="Колоды" />
                <Tab value="decksShop" label="Колоды магазина" />
                <Tab value="ballGroups" label="Колоды шаров" />
            </Tabs>

            {tab === "decks" && <DeckList source="Decks" />}
            {tab === "decksShop" && <DeckList source="DecksShop" />}
            {tab === "ballGroups" && <BallGroupList />}

            <Dialog open={confirmingExport} onClose={() => setConfirmingExport(false)}>
                <DialogTitle>Экспортировать колоды в Google Sheets?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Запишет изменения {store.blueprintDeckPendingExportCount} колод(ы) обратно в реальные
                        таблицы Decks/DecksShop/BallGroups (по колонке DeckId — все строки этой колоды заменяются
                        текущим набором предметов или шаров). Действие необратимо.
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
