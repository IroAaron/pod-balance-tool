import { useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import ItemDescription from "../../components/ItemDescription";
import IconTokenInsertButton from "../../components/IconTokenInsertButton";
import { roundAsItemStub } from "./roundAsItemStub";

type Props = {
    id?: string;
};

export default function RoundDetailPage({ id: idProp }: Props = {}) {
    const params = useParams<{ id: string }>();
    const id = idProp ?? params.id;
    const store = useStore();
    const round = id ? store.getRound(id) : undefined;
    const [editingDescription, setEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const descriptionFieldRef = useRef<HTMLTextAreaElement | null>(null);

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

    if (!round) {
        return (
            <Stack spacing={2}>
                <Typography variant="h5">Раунд не найден</Typography>
                <Button component={RouterLink} to="/rounds">
                    ← К списку раундов
                </Button>
            </Stack>
        );
    }

    const artefact = round.invisibleArtefactId ? store.getItem(round.invisibleArtefactId) : undefined;

    const rawParams = Object.entries(round.raw).filter(
        ([key, value]) =>
            !["roundid", "roundrules", "additionalinvisibleartefact"].includes(key.trim().toLowerCase()) &&
            !/^deckballs(_\d+)?$/i.test(key.trim()) &&
            value !== ""
    );

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Button component={RouterLink} to="/rounds" size="small" sx={{ alignSelf: "flex-start" }}>
                ← К списку раундов
            </Button>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h4">{store.roundName(round)}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {round.id}
                    {round.rules ? ` · ${round.rules}` : ""}
                </Typography>

                {editingDescription ? (
                    <Stack spacing={1} sx={{ maxWidth: 600 }}>
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
                                    <ItemDescription item={roundAsItemStub(round)} description={descriptionDraft} />
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
                                    store.setTranslationOverride(round.descKey, descriptionDraft);
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
                    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                        {store.roundDescription(round) && (
                            <Typography sx={{ flex: 1 }}>
                                <ItemDescription item={roundAsItemStub(round)} description={store.roundDescription(round)} />
                            </Typography>
                        )}
                        <IconButton
                            size="small"
                            aria-label="Редактировать описание"
                            onClick={() => {
                                setDescriptionDraft(store.roundDescription(round));
                                setEditingDescription(true);
                            }}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                )}
            </Paper>

            {artefact && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Невидимый артефакт
                    </Typography>
                    <Stack
                        direction="row"
                        spacing={1}
                        component={RouterLink}
                        to={`/items/${encodeURIComponent(artefact.id)}`}
                        sx={{ textDecoration: "none", color: "inherit", alignItems: "center" }}
                    >
                        <ItemIcon item={artefact} size={32} />
                        <Typography>{store.itemName(artefact)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {artefact.id}
                        </Typography>
                    </Stack>
                </Paper>
            )}

            {round.deckBalls.length > 0 && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Колода
                    </Typography>
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {round.deckBalls.map((ball, index) => (
                            <Chip key={`${ball}-${index}`} label={ball} size="small" />
                        ))}
                    </Stack>
                </Paper>
            )}

            {rawParams.length > 0 && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Параметры
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                            gap: 1.5,
                        }}
                    >
                        {rawParams.map(([key, value]) => (
                            <Box key={key}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                    {key}
                                </Typography>
                                <Typography variant="body2">{value}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Paper>
            )}
        </Stack>
    );
}
