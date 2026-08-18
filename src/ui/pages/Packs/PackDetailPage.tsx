import { useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    IconButton,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useStore } from "../../hooks/useStore";
import ItemDescription from "../../components/ItemDescription";
import IconTokenInsertButton from "../../components/IconTokenInsertButton";
import PackSourceRow from "./PackSourceRow";
import { packAsItemStub } from "./packAsItemStub";
import type { Pack, PackSourceEntry } from "../../../core/models/Pack";

type Props = {
    id?: string;
};

export default function PackDetailPage({ id: idProp }: Props = {}) {
    const params = useParams<{ id: string }>();
    const id = idProp ?? params.id;
    const store = useStore();
    const pack = id ? store.getPack(id) : undefined;

    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [editingDescription, setEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const descriptionFieldRef = useRef<HTMLTextAreaElement | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [costText, setCostText] = useState(pack?.cost?.toString() ?? "");
    const [itemsToTakeText, setItemsToTakeText] = useState(pack?.itemsToTake?.toString() ?? "");

    const handleInsertToken = (token: string) => {
        const field = descriptionFieldRef.current;
        const start = field?.selectionStart ?? descriptionDraft.length;
        const end = field?.selectionEnd ?? descriptionDraft.length;
        const next = descriptionDraft.slice(0, start) + token + descriptionDraft.slice(end);
        setDescriptionDraft(next);

        requestAnimationFrame(() => {
            field?.focus();
            field?.setSelectionRange(start + token.length, start + token.length);
        });
    };

    if (!pack) {
        return (
            <Stack spacing={2}>
                <Typography variant="h5">Пак не найден</Typography>
                <Button component={RouterLink} to="/packs">
                    ← К списку паков
                </Button>
            </Stack>
        );
    }

    const updatePack = (patch: Partial<Pack>) => {
        store.upsertPack({ ...pack, ...patch });
    };

    const updateSources = (nextSources: PackSourceEntry[]) => {
        store.upsertPack({ ...pack, sources: nextSources });
    };

    const handleSourceCommit = (entryId: string, patch: Partial<PackSourceEntry>) => {
        updateSources(pack.sources.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)));
    };

    const handleSourceDelete = (entryId: string) => {
        updateSources(pack.sources.filter((entry) => entry.id !== entryId));
    };

    const handleAddSource = () => {
        updateSources([
            ...pack.sources,
            { id: `pack-source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, sourceDeckId: "" },
        ]);
    };

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Button component={RouterLink} to="/packs" size="small" sx={{ alignSelf: "flex-start" }}>
                ← К списку паков
            </Button>

            <Paper sx={{ p: 3 }}>
                {editingName ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <TextField
                            size="small"
                            value={nameDraft}
                            onChange={(event) => setNameDraft(event.target.value)}
                            autoFocus
                            fullWidth
                            sx={{ maxWidth: 400 }}
                        />
                        <Button
                            size="small"
                            variant="contained"
                            onClick={() => {
                                store.setTranslationOverride(pack.nameKey, nameDraft);
                                setEditingName(false);
                            }}
                        >
                            OK
                        </Button>
                        <Button size="small" onClick={() => setEditingName(false)}>
                            Отмена
                        </Button>
                    </Stack>
                ) : (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Typography variant="h4">{store.packName(pack)}</Typography>
                        <IconButton
                            size="small"
                            aria-label="Редактировать название"
                            onClick={() => {
                                setNameDraft(store.packName(pack));
                                setEditingName(true);
                            }}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                )}

                <Typography variant="body2" color="text.secondary">
                    {pack.id}
                </Typography>

                {editingDescription ? (
                    <Stack spacing={1} sx={{ mt: 2, maxWidth: 600 }}>
                        <TextField
                            value={descriptionDraft}
                            onChange={(event) => setDescriptionDraft(event.target.value)}
                            inputRef={descriptionFieldRef}
                            multiline
                            minRows={2}
                            maxRows={12}
                            autoFocus
                            fullWidth
                            helperText="Обычный текст, как в таблице переводов — [img]/[color]/{...} не рендерятся здесь. {item:ID}/{tag:Имя} — значки, вставляются кнопкой ниже."
                        />

                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                                Превью (как в настройках «Описания предметов»)
                            </Typography>
                            <Typography>
                                {descriptionDraft ? (
                                    <ItemDescription item={packAsItemStub(pack)} description={descriptionDraft} />
                                ) : (
                                    <Typography component="span" color="text.secondary" sx={{ fontStyle: "italic" }}>
                                        (пусто)
                                    </Typography>
                                )}
                            </Typography>
                        </Paper>

                        <Stack direction="row" spacing={1}>
                            <Button
                                size="small"
                                variant="contained"
                                onClick={() => {
                                    store.setTranslationOverride(pack.descKey, descriptionDraft);
                                    setEditingDescription(false);
                                }}
                            >
                                Сохранить
                            </Button>
                            <Button size="small" onClick={() => setEditingDescription(false)}>
                                Отмена
                            </Button>
                            <IconTokenInsertButton onInsert={handleInsertToken} />
                        </Stack>
                    </Stack>
                ) : (
                    <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "flex-start" }}>
                        {store.packDescription(pack) && (
                            <Typography sx={{ flex: 1 }}>
                                <ItemDescription item={packAsItemStub(pack)} description={store.packDescription(pack)} />
                            </Typography>
                        )}
                        <IconButton
                            size="small"
                            aria-label="Редактировать описание"
                            onClick={() => {
                                setDescriptionDraft(store.packDescription(pack));
                                setEditingDescription(true);
                            }}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                )}
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Параметры
                </Typography>
                <Stack spacing={2}>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                        <TextField
                            label="Цена (Cost)"
                            type="number"
                            size="small"
                            value={costText}
                            onChange={(event) => setCostText(event.target.value)}
                            onBlur={() => updatePack({ cost: costText.trim() === "" ? undefined : Number(costText) })}
                            sx={{ width: 160 }}
                        />
                        <TextField
                            label="Сколько взять (ItemsToTake)"
                            type="number"
                            size="small"
                            value={itemsToTakeText}
                            onChange={(event) => setItemsToTakeText(event.target.value)}
                            onBlur={() =>
                                updatePack({
                                    itemsToTake: itemsToTakeText.trim() === "" ? undefined : Number(itemsToTakeText),
                                })
                            }
                            sx={{ width: 220 }}
                        />
                    </Stack>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={pack.useWeights ?? false}
                                    onChange={(event) => updatePack({ useWeights: event.target.checked || undefined })}
                                />
                            }
                            label="Использовать веса (UseWeights)"
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={pack.allowDuplicates ?? false}
                                    onChange={(event) =>
                                        updatePack({ allowDuplicates: event.target.checked || undefined })
                                    }
                                />
                            }
                            label="Разрешить повторения (AllowDuplicates)"
                        />
                    </Stack>
                    <TextField
                        label="MetaTag"
                        size="small"
                        value={pack.metaTag ?? ""}
                        disabled
                        helperText="Пока не используется"
                        sx={{ maxWidth: 300 }}
                    />
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Источники
                </Typography>
                <Stack spacing={1.5}>
                    {pack.sources.map((entry) => (
                        <PackSourceRow
                            key={entry.id}
                            entry={entry}
                            onCommit={handleSourceCommit}
                            onDelete={handleSourceDelete}
                        />
                    ))}
                </Stack>

                {pack.sources.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        Пока нет источников.
                    </Typography>
                )}

                <Button size="small" onClick={handleAddSource} sx={{ mt: 1.5, alignSelf: "flex-start" }}>
                    + Добавить источник
                </Button>
            </Paper>

            <Button
                color="error"
                variant="outlined"
                onClick={() => setConfirmingDelete(true)}
                sx={{ alignSelf: "flex-start" }}
            >
                Удалить пак
            </Button>

            <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
                <DialogTitle>Удалить пак «{pack.id}»?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Пак будет удалён с сайта сразу. В реальной таблице Packs его строки удалятся только после
                        экспорта паков.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingDelete(false)}>Отмена</Button>
                    <Button
                        color="error"
                        onClick={() => {
                            store.deletePack(pack.id);
                            setConfirmingDelete(false);
                        }}
                    >
                        Удалить
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
