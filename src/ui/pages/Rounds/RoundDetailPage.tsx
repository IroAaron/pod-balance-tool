import { useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { Autocomplete, Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import ItemDescription from "../../components/ItemDescription";
import IconTokenInsertButton from "../../components/IconTokenInsertButton";
import { roundAsItemStub } from "./roundAsItemStub";
import SpecialRoundTypesPopover from "./SpecialRoundTypesPopover";
import type { Item } from "../../../core/models/Item";
import type { Deck } from "../../../core/models/Deck";
import type { BallGroup } from "../../../core/models/BallGroup";

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
    const tempDeck = round.tempDeckId ? store.getDeck(round.tempDeckId) : undefined;
    const invisibleArtefacts = store.items.filter((item) => item.id.startsWith("in_a_"));
    const decksShop = store.decks.filter((deck) => deck.source === "DecksShop");

    const rawParams = Object.entries(round.raw).filter(
        ([key, value]) =>
            !["roundid", "roundrules", "additionalinvisibleartefact", "tempdeck"].includes(key.trim().toLowerCase()) &&
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

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Параметры
                </Typography>
                <Stack spacing={2} sx={{ maxWidth: 500 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                        <Autocomplete
                            sx={{ flex: 1 }}
                            size="small"
                            freeSolo
                            options={store.specialRoundTypes}
                            value={round.rules ?? null}
                            onChange={(_event, value) =>
                                store.updateRoundFields(round.id, { rules: value?.trim() || undefined })
                            }
                            onInputChange={(_event, value, reason) => {
                                if (reason === "input") return;
                                store.updateRoundFields(round.id, { rules: value.trim() || undefined });
                            }}
                            renderInput={(params) => <TextField {...params} label="Спец. раунд" />}
                        />
                        <SpecialRoundTypesPopover />
                    </Stack>

                    <Autocomplete
                        size="small"
                        options={invisibleArtefacts}
                        value={artefact ?? null}
                        getOptionLabel={(item: Item) => `${store.itemName(item)} (${item.id})`}
                        onChange={(_event, item) =>
                            store.updateRoundFields(round.id, { invisibleArtefactId: item?.id ?? undefined })
                        }
                        renderInput={(params) => <TextField {...params} label="Невидимый артефакт" />}
                    />

                    {artefact && (
                        <Stack
                            direction="row"
                            spacing={1}
                            component={RouterLink}
                            to={`/items/${encodeURIComponent(artefact.id)}`}
                            sx={{ textDecoration: "none", color: "inherit", alignItems: "center" }}
                        >
                            <ItemIcon item={artefact} size={24} />
                            <Typography variant="body2">{store.itemName(artefact)}</Typography>
                        </Stack>
                    )}

                    <Autocomplete
                        size="small"
                        options={decksShop}
                        value={tempDeck ?? null}
                        getOptionLabel={(deck: Deck) => deck.id}
                        onChange={(_event, deck) =>
                            store.updateRoundFields(round.id, { tempDeckId: deck?.id ?? undefined })
                        }
                        renderInput={(params) => (
                            <TextField {...params} label="Своя колода (Колоды магазина)" />
                        )}
                    />
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Колоды шаров
                </Typography>
                <Stack spacing={2} sx={{ maxWidth: 500 }}>
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {round.deckBalls.map((groupId) => (
                            <Chip
                                key={groupId}
                                label={groupId}
                                size="small"
                                onDelete={() =>
                                    store.updateRoundFields(round.id, {
                                        deckBalls: round.deckBalls.filter((id) => id !== groupId),
                                    })
                                }
                            />
                        ))}
                        {round.deckBalls.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                                Колод шаров пока нет.
                            </Typography>
                        )}
                    </Stack>

                    <Autocomplete
                        size="small"
                        disabled={round.deckBalls.length >= 10}
                        options={store.ballGroups.filter((group) => !round.deckBalls.includes(group.id))}
                        value={null}
                        getOptionLabel={(group: BallGroup) => group.id}
                        onChange={(_event, group) => {
                            if (!group) return;
                            store.updateRoundFields(round.id, { deckBalls: [...round.deckBalls, group.id] });
                        }}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label={round.deckBalls.length >= 10 ? "Достигнут предел (10)" : "+ Добавить колоду шаров"}
                            />
                        )}
                    />
                </Stack>
            </Paper>

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
