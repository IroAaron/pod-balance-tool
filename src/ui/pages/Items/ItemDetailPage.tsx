import { useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { relatedItems } from "../../../core/domain/relations";
import type { MechanicRow } from "../../../core/models/Mechanic";

export default function ItemDetailPage() {
    const { id } = useParams<{ id: string }>();
    const store = useStore();
    const item = id ? store.getItem(id) : undefined;
    const [editingIcon, setEditingIcon] = useState(false);
    const [iconDraft, setIconDraft] = useState("");

    const related = useMemo(() => {
        if (!item) return [];
        return relatedItems(item.id, store.items, store.mechanics, store.upgradeChains).slice(0, 12);
    }, [item, store.items, store.mechanics, store.upgradeChains]);

    if (!item) {
        return (
            <Stack spacing={2}>
                <Typography variant="h5">Предмет не найден</Typography>
                <Button component={RouterLink} to="/items">
                    ← К списку предметов
                </Button>
            </Stack>
        );
    }

    const builds = store.buildsForItem(item.id);
    const chain = store.chainForItem(item.id);
    const icon = store.getItemIcon(item.id) ?? "🧩";

    const mechanicsByTable = new Map<string, MechanicRow[]>();
    for (const mechanic of store.mechanics.filter((row) => row.itemId === item.id)) {
        if (!mechanicsByTable.has(mechanic.table)) mechanicsByTable.set(mechanic.table, []);
        mechanicsByTable.get(mechanic.table)!.push(mechanic);
    }

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Button component={RouterLink} to="/items" size="small" sx={{ alignSelf: "flex-start" }}>
                ← К списку предметов
            </Button>

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
                            <Typography
                                variant="h2"
                                onClick={() => {
                                    setIconDraft(icon);
                                    setEditingIcon(true);
                                }}
                                sx={{ cursor: "pointer" }}
                                title="Изменить иконку"
                            >
                                {icon}
                            </Typography>
                        )}
                    </Box>

                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h4">{store.itemName(item)}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {item.id}
                            {item.itemType ? ` · ${item.itemType}` : ""}
                        </Typography>

                        {store.itemDescription(item) && (
                            <Typography sx={{ mt: 2 }}>{store.itemDescription(item)}</Typography>
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
