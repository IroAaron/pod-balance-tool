import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import type { BalanceSaveMeta } from "../../../core/models/BalanceSave";

/** Local-only form state for naming a new save — shared between the plain "Сохранить текущий баланс" button and
 *  the "Сохранить текущий и восстановить X" branch of the restore-confirmation flow below. */
interface CreateFlow {
    /** Set only when this create happens as step 1 of a restore (see RestoreFlow) — after the save succeeds, the
     *  given save is restored immediately and this dialog closes on its own. */
    thenRestore: BalanceSaveMeta | null;
}

type RestoreFlow =
    | { stage: "confirm"; target: BalanceSaveMeta; currentSaved: boolean }
    | { stage: "restoring"; target: BalanceSaveMeta };

export default function SavesPage() {
    const store = useStore();
    const [createFlow, setCreateFlow] = useState<CreateFlow | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [restoreFlow, setRestoreFlow] = useState<RestoreFlow | null>(null);
    const [restoreError, setRestoreError] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<BalanceSaveMeta | null>(null);

    const openCreate = (thenRestore: BalanceSaveMeta | null = null) => {
        setName(thenRestore ? `Автосохранение — ${new Date().toLocaleString("ru-RU")}` : "");
        setDescription("");
        setSaveError(null);
        setCreateFlow({ thenRestore });
    };

    const confirmCreate = async () => {
        if (!name.trim()) return;
        setSaving(true);
        setSaveError(null);
        try {
            await store.createBalanceSave(name.trim(), description.trim());
            const thenRestore = createFlow?.thenRestore;
            setCreateFlow(null);
            if (thenRestore) await runRestore(thenRestore);
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    };

    const openRestore = (target: BalanceSaveMeta) => {
        setRestoreError(null);
        setRestoreFlow({ stage: "confirm", target, currentSaved: store.isCurrentBalanceSaved() });
    };

    const runRestore = async (target: BalanceSaveMeta) => {
        setRestoreError(null);
        setRestoreFlow({ stage: "restoring", target });
        try {
            await store.restoreBalanceSave(target.id);
            setRestoreFlow(null);
        } catch (error) {
            setRestoreError(error instanceof Error ? error.message : String(error));
            setRestoreFlow(null);
        }
    };

    const confirmDelete = () => {
        if (!deleteTarget) return;
        store.deleteBalanceSave(deleteTarget.id);
        setDeleteTarget(null);
    };

    const saves = [...store.balanceSaves].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Typography variant="h4">Сохранения баланса</Typography>

            <Typography variant="body2" color="text.secondary">
                Именованный снимок текущего баланса — предметы, механики, переводы, билды, иконки, глоссарий и
                остальные общие настройки. Общий для всех, кто открывает сайт. Здесь видно только название и
                описание сохранения; восстановить или удалить его можно кнопками ниже.
            </Typography>

            <Box>
                <Button variant="contained" onClick={() => openCreate()}>
                    Сохранить текущий баланс
                </Button>
            </Box>

            {restoreError && (
                <Alert severity="error" onClose={() => setRestoreError(null)}>
                    {restoreError}
                </Alert>
            )}

            {!store.balanceSavesReady && (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                        Загрузка сохранений...
                    </Typography>
                </Stack>
            )}

            {store.balanceSavesReady && saves.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                    Сохранений пока нет.
                </Typography>
            )}

            <Stack spacing={2}>
                {saves.map((save) => (
                    <Paper key={save.id} sx={{ p: 2 }}>
                        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="h6">{save.name}</Typography>
                                {save.description && (
                                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                                        {save.description}
                                    </Typography>
                                )}
                                <Typography variant="caption" color="text.secondary">
                                    {new Date(save.createdAt).toLocaleString("ru-RU")}
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => openRestore(save)}
                                    disabled={restoreFlow?.stage === "restoring"}
                                >
                                    Восстановить
                                </Button>
                                <Button size="small" color="error" onClick={() => setDeleteTarget(save)}>
                                    Удалить
                                </Button>
                            </Stack>
                        </Stack>
                    </Paper>
                ))}
            </Stack>

            <Dialog open={createFlow !== null} onClose={() => (saving ? undefined : setCreateFlow(null))}>
                <DialogTitle>
                    {createFlow?.thenRestore ? `Сохранить текущий баланс перед восстановлением` : "Сохранить текущий баланс"}
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1, minWidth: 400 }}>
                        {createFlow?.thenRestore && (
                            <DialogContentText>
                                После сохранения будет восстановлено «{createFlow.thenRestore.name}».
                            </DialogContentText>
                        )}
                        <TextField
                            label="Название"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            autoFocus
                            fullWidth
                            size="small"
                        />
                        <TextField
                            label="Описание"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            fullWidth
                            multiline
                            minRows={2}
                            size="small"
                        />
                        {saveError && <Alert severity="error">{saveError}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateFlow(null)} disabled={saving}>
                        Отмена
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => void confirmCreate()}
                        disabled={saving || !name.trim()}
                        startIcon={saving ? <CircularProgress size={16} /> : undefined}
                    >
                        {saving ? "Сохранение..." : "Сохранить"}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={restoreFlow?.stage === "confirm"} onClose={() => setRestoreFlow(null)}>
                <DialogTitle>Вы уверены?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {restoreFlow?.stage === "confirm" && restoreFlow.currentSaved
                            ? `Текущий баланс уже сохранён. Восстановить «${restoreFlow.target.name}»?`
                            : `Текущий баланс не сохранён — несохранённые изменения будут потеряны при восстановлении «${restoreFlow?.stage === "confirm" ? restoreFlow.target.name : ""}».`}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    {restoreFlow?.stage === "confirm" && restoreFlow.currentSaved ? (
                        <>
                            <Button onClick={() => setRestoreFlow(null)}>Отмена</Button>
                            <Button color="error" onClick={() => void runRestore(restoreFlow.target)}>
                                Восстановить
                            </Button>
                        </>
                    ) : (
                        restoreFlow?.stage === "confirm" && (
                            <>
                                <Button
                                    onClick={() => {
                                        const target = restoreFlow.target;
                                        setRestoreFlow(null);
                                        openCreate(target);
                                    }}
                                >
                                    Сохранить текущий и восстановить «{restoreFlow.target.name}»
                                </Button>
                                <Button onClick={() => setRestoreFlow(null)}>Отмена</Button>
                                <Button color="error" onClick={() => void runRestore(restoreFlow.target)}>
                                    Не сохранять и восстановить «{restoreFlow.target.name}»
                                </Button>
                            </>
                        )
                    )}
                </DialogActions>
            </Dialog>

            <Dialog open={restoreFlow?.stage === "restoring"}>
                <DialogContent>
                    <Stack direction="row" spacing={2} sx={{ alignItems: "center", py: 1 }}>
                        <CircularProgress size={20} />
                        <Typography>Восстановление...</Typography>
                    </Stack>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
                <DialogTitle>Удалить сохранение?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Сохранение «{deleteTarget?.name}» будет удалено безвозвратно.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteTarget(null)}>Отмена</Button>
                    <Button color="error" onClick={confirmDelete}>
                        Удалить
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
