import { useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
    Autocomplete,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
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
import { ballAsItemStub } from "./ballAsItemStub";
import type { Ball } from "../../../core/models/Ball";

type Props = {
    id?: string;
};

/** One numeric field wired to local-state-until-blur, matching the established convention (Cost/ItemsToTake on
 *  PackDetailPage) — committing on every keystroke caused a real typing bug there (re-render mid-selection). */
function NumberField({
    label,
    value,
    onCommit,
    width = 140,
}: {
    label: string;
    value: number | undefined;
    onCommit: (value: number | undefined) => void;
    width?: number;
}) {
    const [text, setText] = useState(value?.toString() ?? "");
    return (
        <TextField
            label={label}
            type="number"
            size="small"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => onCommit(text.trim() === "" ? undefined : Number(text))}
            sx={{ width }}
        />
    );
}

export default function BallDetailPage({ id: idProp }: Props = {}) {
    const params = useParams<{ id: string }>();
    const id = idProp ?? params.id;
    const store = useStore();
    const ball = id ? store.getBall(id) : undefined;

    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [editingDescription, setEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const descriptionFieldRef = useRef<HTMLTextAreaElement | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

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

    if (!ball) {
        return (
            <Stack spacing={2}>
                <Typography variant="h5">Шар не найден</Typography>
                <Button component={RouterLink} to="/balls">
                    ← К списку шаров
                </Button>
            </Stack>
        );
    }

    const updateBall = (patch: Partial<Ball>) => {
        store.upsertBall({ ...ball, ...patch });
    };

    const colorOptions = [...new Set(store.balls.map((b) => b.color).filter((color): color is string => Boolean(color)))].sort();

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Button component={RouterLink} to="/balls" size="small" sx={{ alignSelf: "flex-start" }}>
                ← К списку шаров
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
                                store.setTranslationOverride(ball.nameKey, nameDraft);
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
                        <Typography variant="h4">{store.ballName(ball)}</Typography>
                        <IconButton
                            size="small"
                            aria-label="Редактировать название"
                            onClick={() => {
                                setNameDraft(store.ballName(ball));
                                setEditingName(true);
                            }}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                )}

                <Typography variant="body2" color="text.secondary">
                    {ball.id}
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
                                    <ItemDescription item={ballAsItemStub(ball)} description={descriptionDraft} />
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
                                    store.setTranslationOverride(ball.descKey, descriptionDraft);
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
                        {store.ballDescription(ball) && (
                            <Typography sx={{ flex: 1 }}>
                                <ItemDescription item={ballAsItemStub(ball)} description={store.ballDescription(ball)} />
                            </Typography>
                        )}
                        <IconButton
                            size="small"
                            aria-label="Редактировать описание"
                            onClick={() => {
                                setDescriptionDraft(store.ballDescription(ball));
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
                        <NumberField label="RunMin" value={ball.runMin} onCommit={(v) => updateBall({ runMin: v })} />
                        <NumberField label="RunMax" value={ball.runMax} onCommit={(v) => updateBall({ runMax: v })} />
                    </Stack>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                        <NumberField
                            label="InertiaMin"
                            value={ball.inertiaMin}
                            onCommit={(v) => updateBall({ inertiaMin: v })}
                        />
                        <NumberField
                            label="InertiaMax"
                            value={ball.inertiaMax}
                            onCommit={(v) => updateBall({ inertiaMax: v })}
                        />
                    </Stack>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                        <NumberField
                            label="ValueMin"
                            value={ball.valueMin}
                            onCommit={(v) => updateBall({ valueMin: v })}
                        />
                        <NumberField
                            label="ValueMax"
                            value={ball.valueMax}
                            onCommit={(v) => updateBall({ valueMax: v })}
                        />
                    </Stack>
                    <Autocomplete
                        freeSolo
                        options={colorOptions}
                        value={ball.color ?? ""}
                        onChange={(_event, value) => updateBall({ color: value?.trim() || undefined })}
                        onInputChange={(_event, value, reason) => {
                            if (reason === "input") updateBall({ color: value.trim() || undefined });
                        }}
                        renderInput={(params) => <TextField {...params} label="Color" size="small" />}
                        sx={{ maxWidth: 220 }}
                    />
                    <TextField
                        label="MetaTag"
                        size="small"
                        value={ball.metaTag ?? ""}
                        disabled
                        helperText="Пока не используется"
                        sx={{ maxWidth: 300 }}
                    />
                </Stack>
            </Paper>

            <Button
                color="error"
                variant="outlined"
                onClick={() => setConfirmingDelete(true)}
                sx={{ alignSelf: "flex-start" }}
            >
                Удалить шар
            </Button>

            <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
                <DialogTitle>Удалить шар «{ball.id}»?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Шар будет удалён с сайта сразу. В реальной таблице Balls его строка не удаляется
                        автоматически — экспорт шаров только обновляет/добавляет строки, не удаляет их.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingDelete(false)}>Отмена</Button>
                    <Button
                        color="error"
                        onClick={() => {
                            store.deleteBall(ball.id);
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
