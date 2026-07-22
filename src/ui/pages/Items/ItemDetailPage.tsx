import { useMemo, useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import ItemDescription from "../../components/ItemDescription";
import IconTokenInsertButton from "../../components/IconTokenInsertButton";
import { relatedItems } from "../../../core/domain/relations";
import type { MechanicRow } from "../../../core/models/Mechanic";

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
    const chain = store.chainForItem(item.id);
    const icon = store.getItemIcon(item.id) ?? "🧩";

    const replacesInto = store.replaceRules.filter((rule) => rule.itemIdToReplace === item.id);
    const replacedFrom = store.replaceRules.filter((rule) => rule.replacementItem === item.id);

    const mechanicsByTable = new Map<string, MechanicRow[]>();
    for (const mechanic of store.mechanics.filter((row) => row.itemId === item.id)) {
        if (!mechanicsByTable.has(mechanic.table)) mechanicsByTable.set(mechanic.table, []);
        mechanicsByTable.get(mechanic.table)!.push(mechanic);
    }

    // The item's own row from whichever source table it came from (Cards/Houses/Artefacts/...) — id and tags are
    // excluded since they're already shown above in their parsed form, not as raw text.
    const rawParams = Object.entries(item.raw).filter(
        ([key, value]) => !["itemid", "id", "tags", "itemtag"].includes(key.trim().toLowerCase()) && value !== ""
    );

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
                                        store.setItemIcon(item.id, iconDraft || "🧩");
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
                            </Stack>
                        )}

                        <Stack direction="row" sx={{ mt: 2, flexWrap: "wrap", gap: 0.5 }}>
                            {item.tags.map((tag) => (
                                <Chip key={tag} label={tag} size="small" />
                            ))}
                        </Stack>
                    </Box>
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Параметры{item.itemType ? ` (${item.itemType})` : ""}
                </Typography>
                {rawParams.length === 0 ? (
                    <Typography color="text.secondary">Параметры не найдены.</Typography>
                ) : (
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
                )}
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Билды ({builds.length})
                </Typography>
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
            </Paper>

            {chain && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Цепочка прокачки
                    </Typography>
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                        {chain.itemIds.map((tierId, index) => {
                            const tierItem = store.getItem(tierId);
                            return (
                                <Stack key={tierId} direction="row" sx={{ alignItems: "center", gap: 1 }}>
                                    {index > 0 && <Typography color="text.secondary">→</Typography>}
                                    <Chip
                                        label={tierItem ? store.itemName(tierItem) : tierId}
                                        component={RouterLink}
                                        to={`/items/${encodeURIComponent(tierId)}`}
                                        clickable
                                        color={tierId === item.id ? "primary" : "default"}
                                    />
                                </Stack>
                            );
                        })}
                    </Stack>
                </Paper>
            )}

            {(replacesInto.length > 0 || replacedFrom.length > 0) && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Замены
                    </Typography>
                    <Stack spacing={1.5}>
                        {replacesInto.map((rule) => {
                            const target = store.getItem(rule.replacementItem);
                            return (
                                <Stack key={rule.id} direction="row" sx={{ alignItems: "center", gap: 1 }}>
                                    <Typography color="text.secondary">{rule.source}: заменяется на</Typography>
                                    <Chip
                                        label={target ? store.itemName(target) : rule.replacementItem}
                                        component={RouterLink}
                                        to={`/items/${encodeURIComponent(rule.replacementItem)}`}
                                        clickable
                                        size="small"
                                    />
                                </Stack>
                            );
                        })}
                        {replacedFrom.map((rule) => {
                            const source = store.getItem(rule.itemIdToReplace);
                            return (
                                <Stack key={rule.id} direction="row" sx={{ alignItems: "center", gap: 1 }}>
                                    <Typography color="text.secondary">{rule.source}: получается заменой из</Typography>
                                    <Chip
                                        label={source ? store.itemName(source) : rule.itemIdToReplace}
                                        component={RouterLink}
                                        to={`/items/${encodeURIComponent(rule.itemIdToReplace)}`}
                                        clickable
                                        size="small"
                                    />
                                </Stack>
                            );
                        })}
                    </Stack>
                </Paper>
            )}

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Механики
                </Typography>
                {mechanicsByTable.size === 0 ? (
                    <Typography color="text.secondary">Механики не найдены.</Typography>
                ) : (
                    <Stack spacing={2}>
                        {[...mechanicsByTable.entries()].map(([table, rows]) => (
                            <Box key={table}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                    {table}
                                </Typography>
                                <Stack spacing={1}>
                                    {rows.map((row) => (
                                        <Box
                                            key={row.id}
                                            sx={{ pl: 1, borderLeft: "2px solid", borderColor: "divider" }}
                                        >
                                            {Object.entries(row.fields).map(([key, value]) => (
                                                <Typography key={key} variant="body2" color="text.secondary">
                                                    <strong>{key}:</strong> {value}
                                                </Typography>
                                            ))}
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                )}
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Возможно связано
                </Typography>
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
            </Paper>
        </Stack>
    );
}
