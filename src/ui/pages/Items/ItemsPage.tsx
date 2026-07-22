import { useCallback, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
    Autocomplete,
    Box,
    Card,
    CardActionArea,
    CardContent,
    Checkbox,
    Chip,
    FormControlLabel,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import ItemDescription from "../../components/ItemDescription";
import { computeUpgradeTierIds } from "../../../core/domain/relations";
import type { ItemSortKey } from "../../../core/services/ItemService";
import type { Item } from "../../../core/models/Item";

export default function ItemsPage() {
    const store = useStore();
    const [query, setQuery] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [itemType, setItemType] = useState("");
    const [sortKey, setSortKey] = useState<ItemSortKey>("name");
    const [includeUpgradeTiers, setIncludeUpgradeTiers] = useState(false);

    // itemName reads live translations at call time, so this stable wrapper stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const resolveName = useCallback((item: Item) => store.itemName(item), []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const resolveBuildCount = useCallback((item: Item) => store.buildsForItem(item.id).length, []);

    const filtered = useMemo(() => {
        let result = store.items;
        if (!includeUpgradeTiers) {
            const tierIds = computeUpgradeTierIds(store.items, store.upgradeChains, resolveName);
            result = result.filter((item) => !tierIds.has(item.id));
        }
        result = store.itemService.filter(result, { tags, itemType: itemType || undefined });
        result = store.itemService.search(result, query, resolveName);
        result = store.itemService.sort(result, sortKey, resolveName, resolveBuildCount);
        return result;
        // itemService is a stable method on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        store.items,
        store.translations,
        store.builds,
        store.upgradeChains,
        query,
        tags,
        itemType,
        sortKey,
        includeUpgradeTiers,
        resolveName,
        resolveBuildCount,
    ]);

    const availableTags = store.paramValues.ItemTag ?? [];
    const availableTypes = store.paramValues.ItemType ?? [];

    return (
        <Stack spacing={3}>
            <Typography variant="h4">Предметы</Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
                <TextField
                    label="Поиск"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    size="small"
                    sx={{ minWidth: 220 }}
                />

                <Autocomplete
                    multiple
                    size="small"
                    options={availableTags}
                    value={tags}
                    onChange={(_event, value) => setTags(value)}
                    renderInput={(params) => <TextField {...params} label="Теги" />}
                    sx={{ minWidth: 240 }}
                />

                <TextField
                    select
                    label="Тип"
                    value={itemType}
                    onChange={(event) => setItemType(event.target.value)}
                    size="small"
                    sx={{ minWidth: 160 }}
                >
                    <MenuItem value="">Все</MenuItem>
                    {availableTypes.map((type) => (
                        <MenuItem key={type} value={type}>
                            {type}
                        </MenuItem>
                    ))}
                </TextField>

                <TextField
                    select
                    label="Сортировка"
                    value={sortKey}
                    onChange={(event) => setSortKey(event.target.value as ItemSortKey)}
                    size="small"
                    sx={{ minWidth: 160 }}
                >
                    <MenuItem value="name">По названию</MenuItem>
                    <MenuItem value="id">По Id</MenuItem>
                    <MenuItem value="tags">По тегам</MenuItem>
                    <MenuItem value="itemType">По типу</MenuItem>
                    <MenuItem value="buildCount">По присутствию в билдах</MenuItem>
                </TextField>

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={includeUpgradeTiers}
                            onChange={(event) => setIncludeUpgradeTiers(event.target.checked)}
                        />
                    }
                    label="Отображать прокачку?"
                />
            </Stack>

            <Typography variant="body2" color="text.secondary">
                Найдено: {filtered.length} из {store.items.length}
            </Typography>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 2,
                }}
            >
                {filtered.map((item) => (
                    <Card
                        key={item.id}
                        variant="outlined"
                        sx={
                            resolveBuildCount(item) === 0
                                ? { bgcolor: "rgba(244, 67, 54, 0.12)", borderColor: "error.main" }
                                : undefined
                        }
                    >
                        <CardActionArea
                            component={RouterLink}
                            to={`/items/${encodeURIComponent(item.id)}`}
                            sx={{ height: "100%" }}
                        >
                            <CardContent>
                                <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
                                    <ItemIcon item={item} size={32} />
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                        {resolveName(item)}
                                    </Typography>
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                    {item.id}
                                </Typography>
                                {store.itemDescription(item) && (
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{
                                            mb: 1,
                                            display: "-webkit-box",
                                            WebkitLineClamp: 3,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden",
                                        }}
                                    >
                                        <ItemDescription item={item} description={store.itemDescription(item)} />
                                    </Typography>
                                )}
                                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                                    {item.tags.map((tag) => (
                                        <Chip key={tag} label={tag} size="small" />
                                    ))}
                                </Stack>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                ))}
            </Box>

            {store.items.length === 0 && (
                <Typography color="text.secondary">
                    Данных пока нет — загрузите их на странице «Источники».
                </Typography>
            )}
        </Stack>
    );
}
