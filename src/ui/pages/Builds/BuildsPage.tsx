import { useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Card,
    CardActionArea,
    CardContent,
    Chip,
    MenuItem,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import { higherTierIds, relatedBuilds, type RelatedBuild } from "../../../core/domain/relations";
import type { BuildSortKey } from "../../../core/services/BuildService";

export default function BuildsPage() {
    const store = useStore();
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<BuildSortKey>("name");
    const [suggestMessage, setSuggestMessage] = useState<string | null>(null);

    const excludedTiers = useMemo(() => higherTierIds(store.upgradeChains), [store.upgradeChains]);

    const filtered = useMemo(() => {
        let result = store.buildService.search(store.builds, query);
        if (tagFilter) {
            result = result.filter((build) =>
                build.items.some((itemId) => store.getItem(itemId)?.tags.includes(tagFilter))
            );
        }
        result = store.buildService.sort(result, sortKey);
        return result;
        // buildService/getItem are stable methods on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.builds, store.items, query, tagFilter, sortKey]);

    const relatedByBuild = useMemo(() => {
        const map = new Map<string, RelatedBuild[]>();
        for (const build of store.builds) {
            map.set(
                build.id,
                relatedBuilds(build.id, store.builds, store.items, store.mechanics, store.upgradeChains, store.replaceRules)
            );
        }
        return map;
    }, [store.builds, store.items, store.mechanics, store.upgradeChains, store.replaceRules]);

    const availableTags = store.paramValues.ItemTag ?? [];

    const handleCreate = () => {
        const build = store.createBuild();
        navigate(`/builds/${encodeURIComponent(build.id)}`);
    };

    const handleSuggest = () => {
        const count = store.suggestBuilds();
        setSuggestMessage(count > 0 ? `Добавлено черновиков: ${count}` : "Новых черновиков не найдено");
    };

    return (
        <Stack spacing={3}>
            <Typography variant="h4">Билды</Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ flexWrap: "wrap", alignItems: { sm: "center" } }}>
                <TextField
                    label="Поиск"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    size="small"
                    sx={{ minWidth: 220 }}
                />

                <Autocomplete
                    options={availableTags}
                    value={tagFilter}
                    onChange={(_event, value) => setTagFilter(value)}
                    renderInput={(params) => <TextField {...params} label="Фильтр по тегу" size="small" />}
                    sx={{ minWidth: 220 }}
                />

                <TextField
                    select
                    label="Сортировка"
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as BuildSortKey)}
                    size="small"
                    sx={{ minWidth: 200 }}
                >
                    <MenuItem value="name">По названию</MenuItem>
                    <MenuItem value="itemCount">По кол-ву предметов</MenuItem>
                </TextField>

                <Box sx={{ flex: 1 }} />

                <Button variant="outlined" onClick={handleSuggest} disabled={store.items.length === 0}>
                    Предложить билды
                </Button>
                <Button variant="contained" onClick={handleCreate}>
                    + Создать билд
                </Button>
            </Stack>

            {suggestMessage && (
                <Alert severity="info" onClose={() => setSuggestMessage(null)}>
                    {suggestMessage}
                </Alert>
            )}

            <Typography variant="body2" color="text.secondary">
                Найдено: {filtered.length} из {store.builds.length}
            </Typography>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 2,
                }}
            >
                {filtered.map((build) => {
                    const buildItems = build.items
                        .filter((itemId) => !excludedTiers.has(itemId))
                        .map((itemId) => store.getItem(itemId))
                        .filter((item): item is NonNullable<typeof item> => Boolean(item));

                    const related = (relatedByBuild.get(build.id) ?? []).slice(0, 6);

                    return (
                        <Card key={build.id} variant="outlined">
                            <CardActionArea component={RouterLink} to={`/builds/${encodeURIComponent(build.id)}`}>
                                <CardContent sx={{ pb: 1 }}>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                        <Typography variant="h6">{build.icon || "🧠"}</Typography>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            {build.name || "Без названия"}
                                        </Typography>
                                        {build.auto && <Chip label="Черновик" size="small" color="warning" />}
                                    </Stack>
                                </CardContent>
                            </CardActionArea>

                            <CardContent sx={{ pt: 0 }}>
                                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
                                    {buildItems.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary">
                                            Предметы не добавлены.
                                        </Typography>
                                    ) : (
                                        buildItems.map((item) => (
                                            <Tooltip key={item.id} title={store.itemName(item)}>
                                                <Box
                                                    component={RouterLink}
                                                    to={`/items/${encodeURIComponent(item.id)}`}
                                                    sx={{ display: "block", lineHeight: 0 }}
                                                >
                                                    <ItemIcon item={item} size={36} />
                                                </Box>
                                            </Tooltip>
                                        ))
                                    )}
                                </Stack>

                                {related.length > 0 && (
                                    <>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ display: "block", mt: 1.5, mb: 0.5 }}
                                        >
                                            Возможно связано с
                                        </Typography>
                                        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
                                            {related.map((rel) => {
                                                const relatedBuild = store.getBuild(rel.id);
                                                if (!relatedBuild) return null;
                                                return (
                                                    <Tooltip key={rel.id} title={relatedBuild.name || "Без названия"}>
                                                        <Chip
                                                            label={relatedBuild.icon || "🧠"}
                                                            size="small"
                                                            component={RouterLink}
                                                            to={`/builds/${encodeURIComponent(rel.id)}`}
                                                            clickable
                                                        />
                                                    </Tooltip>
                                                );
                                            })}
                                        </Stack>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </Box>

            {store.builds.length === 0 && (
                <Typography color="text.secondary">
                    Билдов пока нет. Создайте вручную или нажмите «Предложить билды», когда загрузите данные.
                </Typography>
            )}
        </Stack>
    );
}
