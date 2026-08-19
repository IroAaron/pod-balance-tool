import { useMemo, useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import ItemDescription from "../../components/ItemDescription";
import IconTokenInsertButton from "../../components/IconTokenInsertButton";
import EnumMultiSelect from "../../components/content/EnumMultiSelect";
import { relatedItems } from "../../../core/domain/relations";
import SectionPaper from "./sections/SectionPaper";
import CopyToUpgradesButton from "./sections/CopyToUpgradesButton";
import ItemParamsSection from "./sections/ItemParamsSection";
import ItemMechanicsSection from "./sections/ItemMechanicsSection";
import ItemUpgradeChainSection from "./sections/ItemUpgradeChainSection";
import ItemReplacesSection from "./sections/ItemReplacesSection";

type Props = {
    /** Overrides the route param — set when rendered inside DetailModal (an "internal window") instead of as a full page. */
    id?: string;
};

export default function ItemDetailPage({ id: idProp }: Props = {}) {
    const params = useParams<{ id: string }>();
    const id = idProp ?? params.id;
    const store = useStore();
    const inModal = idProp !== undefined;
    const item = id ? store.getItem(id) : undefined;
    const [editingIcon, setEditingIcon] = useState(false);
    const [iconDraft, setIconDraft] = useState("");
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [editingDescription, setEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const descriptionFieldRef = useRef<HTMLTextAreaElement | null>(null);

    // Splices at the current cursor position (falling back to the end if the field never had focus) rather than
    // always appending, so inserting a second token in the middle of already-typed text lands where expected.
    const handleInsertToken = (token: string) => {
        const field = descriptionFieldRef.current;
        const start = field?.selectionStart ?? descriptionDraft.length;
        const end = field?.selectionEnd ?? descriptionDraft.length;
        const next = descriptionDraft.slice(0, start) + token + descriptionDraft.slice(end);
        setDescriptionDraft(next);

        // Restore focus/caret after the inserted token — has to wait a tick for the TextField's own re-render
        // with the new value to land before selectionStart/End can be set on it again.
        requestAnimationFrame(() => {
            field?.focus();
            field?.setSelectionRange(start + token.length, start + token.length);
        });
    };

    const related = useMemo(() => {
        if (!item) return [];
        return relatedItems(item.id, store.items, store.mechanics, store.upgradeChains, store.replaceRules).slice(
            0,
            12
        );
    }, [item, store.items, store.mechanics, store.upgradeChains, store.replaceRules]);

    if (!item) {
        return (
            <Stack spacing={2}>
                <Typography variant="h5">Предмет не найден</Typography>
                {!inModal && (
                    <Button component={RouterLink} to="/items">
                        ← К списку предметов
                    </Button>
                )}
            </Stack>
        );
    }

    const builds = store.buildsForItem(item.id);
    const attachedRounds = store.rounds.filter((round) => round.invisibleArtefactId === item.id);
    const icon = store.getItemIcon(item.id) ?? "🧩";

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            {!inModal && (
                <Button component={RouterLink} to="/items" size="small" sx={{ alignSelf: "flex-start" }}>
                    ← К списку предметов
                </Button>
            )}

            <Paper sx={{ p: 3 }}>
                <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
                    <Box>
                        {editingIcon ? (
                            <Stack direction="row" spacing={1}>
                                <TextField
                                    size="small"
                                    value={iconDraft}
                                    onChange={(event) => setIconDraft(event.target.value)}
                                    sx={{ width: 80 }}
                                    autoFocus
                                />
                                <Button
                                    size="small"
                                    onClick={() => {
                                        // Empty means "no manual icon" — falling back to the placeholder here
                                        // used to store it as a real icon, which then hid the item's sprite.
                                        store.setItemIcon(item.id, iconDraft);
                                        setEditingIcon(false);
                                    }}
                                >
                                    OK
                                </Button>
                            </Stack>
                        ) : (
                            <Box
                                onClick={() => {
                                    setIconDraft(icon);
                                    setEditingIcon(true);
                                }}
                                sx={{ cursor: "pointer" }}
                                title="Изменить иконку"
                            >
                                <ItemIcon item={item} size={96} />
                            </Box>
                        )}
                    </Box>

                    <Box sx={{ flex: 1 }}>
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
                                        store.setTranslationOverride(item.nameKey ?? item.id, nameDraft);
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
                                <Typography variant="h4">{store.itemName(item)}</Typography>
                                <IconButton
                                    size="small"
                                    aria-label="Редактировать название"
                                    onClick={() => {
                                        setNameDraft(store.itemName(item));
                                        setEditingName(true);
                                    }}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                                <CopyToUpgradesButton
                                    item={item}
                                    what="название"
                                    description="Названия прокачек станут этим названием с добавлением +/++ по уровню."
                                    onCopy={() => store.copyNameToUpgrades(item.id)}
                                />
                            </Stack>
                        )}

                        <Typography variant="body2" color="text.secondary">
                            {item.id}
                            {item.itemType ? ` · ${item.itemType}` : ""}
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
                                            <ItemDescription item={item} description={descriptionDraft} />
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
                                            store.setTranslationOverride(
                                                item.descKey ?? `${item.id}_desc`,
                                                descriptionDraft
                                            );
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
                                {store.itemDescription(item) && (
                                    <Typography sx={{ flex: 1 }}>
                                        <ItemDescription item={item} description={store.itemDescription(item)} />
                                    </Typography>
                                )}
                                <IconButton
                                    size="small"
                                    aria-label="Редактировать описание"
                                    onClick={() => {
                                        setDescriptionDraft(store.itemDescription(item));
                                        setEditingDescription(true);
                                    }}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                                <CopyToUpgradesButton
                                    item={item}
                                    what="описание"
                                    description="Текущее описание заменит описания прокачек."
                                    onCopy={() => store.copyDescriptionToUpgrades(item.id)}
                                />
                            </Stack>
                        )}

                        <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
                            <Box sx={{ flex: 1, maxWidth: 420 }}>
                                <EnumMultiSelect
                                    dimension="ItemTag"
                                    label="Теги"
                                    value={item.tags}
                                    onChange={(tags) => store.upsertItem(item.id, item.itemType ?? "Card", { tags })}
                                />
                            </Box>
                            <CopyToUpgradesButton
                                item={item}
                                what="теги"
                                description="Теги этого предмета заменят теги его прокачек."
                                onCopy={() => store.copyTagsToUpgrades(item.id)}
                            />
                        </Stack>
                    </Box>
                </Stack>
            </Paper>

            <ItemParamsSection item={item} />

            <ItemMechanicsSection item={item} />

            <ItemUpgradeChainSection item={item} />

            <ItemReplacesSection item={item} />

            {attachedRounds.length > 0 && (
                <SectionPaper title="Раунды">
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                        {attachedRounds.map((round) => (
                            <Chip
                                key={round.id}
                                label={store.roundName(round)}
                                component={RouterLink}
                                to={`/rounds/${encodeURIComponent(round.id)}`}
                                clickable
                            />
                        ))}
                    </Stack>
                </SectionPaper>
            )}

            {/* Everything below is derived, not edited here — kept at the end so the editable sections come first. */}
            <SectionPaper title={`Билды (${builds.length})`}>
                {builds.length === 0 ? (
                    <Typography color="text.secondary">Пока не входит ни в один билд.</Typography>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                        {builds.map((build) => (
                            <Chip
                                key={build.id}
                                label={`${build.icon || "🧠"} ${build.name || "Без названия"}`}
                                component={RouterLink}
                                to={`/builds/${encodeURIComponent(build.id)}`}
                                clickable
                            />
                        ))}
                    </Stack>
                )}
            </SectionPaper>

            <SectionPaper title="Возможно связано">
                {related.length === 0 ? (
                    <Typography color="text.secondary">Связанные предметы не найдены.</Typography>
                ) : (
                    <Stack spacing={1}>
                        {related.map((rel) => {
                            const relatedItem = store.getItem(rel.id);
                            if (!relatedItem) return null;
                            return (
                                <Stack
                                    key={rel.id}
                                    direction="row"
                                    spacing={1}
                                    component={RouterLink}
                                    to={`/items/${encodeURIComponent(rel.id)}`}
                                    sx={{ textDecoration: "none", color: "inherit", alignItems: "center" }}
                                >
                                    <Chip
                                        label={rel.strength === "strong" ? "сильная связь" : "возможно"}
                                        size="small"
                                        color={rel.strength === "strong" ? "primary" : "default"}
                                    />
                                    <Typography>{store.itemName(relatedItem)}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {rel.reasons.join("; ")}
                                    </Typography>
                                </Stack>
                            );
                        })}
                    </Stack>
                )}
            </SectionPaper>
        </Stack>
    );
}
