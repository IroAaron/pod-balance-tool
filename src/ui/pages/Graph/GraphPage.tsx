import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Autocomplete, Box, Card, CardActionArea, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { higherTierIds } from "../../../core/domain/relations";

export default function GraphPage() {
    const store = useStore();
    const [tagFilter, setTagFilter] = useState<string | null>(null);

    const excludedTiers = useMemo(() => higherTierIds(store.upgradeChains), [store.upgradeChains]);

    const filteredBuilds = useMemo(() => {
        if (!tagFilter) return store.builds;
        return store.builds.filter((build) =>
            build.items.some((itemId) => store.getItem(itemId)?.tags.includes(tagFilter))
        );
        // getItem is a stable method on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.builds, store.items, tagFilter]);

    const availableTags = store.paramValues.ItemTag ?? [];

    return (
        <Stack spacing={2}>
            <Typography variant="h4">Граф</Typography>

            <Autocomplete
                options={availableTags}
                value={tagFilter}
                onChange={(_event, value) => setTagFilter(value)}
                renderInput={(params) => <TextField {...params} label="Фильтр по тегу (билды)" size="small" />}
                sx={{ maxWidth: 300 }}
            />

            {filteredBuilds.length === 0 ? (
                <Typography color="text.secondary">Билдов пока нет — создайте их на странице «Билды».</Typography>
            ) : (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: 2,
                    }}
                >
                    {filteredBuilds.map((build) => {
                        const buildItems = build.items
                            .filter((itemId) => !excludedTiers.has(itemId))
                            .map((itemId) => store.getItem(itemId))
                            .filter((item): item is NonNullable<typeof item> => Boolean(item));

                        return (
                            <Card key={build.id} variant="outlined">
                                <CardActionArea component={RouterLink} to={`/builds/${encodeURIComponent(build.id)}`}>
                                    <CardContent sx={{ pb: 1 }}>
                                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                            <Typography variant="h6">{build.icon || "🧠"}</Typography>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                {build.name || "Без названия"}
                                            </Typography>
                                        </Stack>
                                    </CardContent>
                                </CardActionArea>

                                <CardContent sx={{ pt: 0 }}>
                                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                                        {buildItems.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary">
                                                Предметы не добавлены.
                                            </Typography>
                                        ) : (
                                            buildItems.map((item) => (
                                                <Chip
                                                    key={item.id}
                                                    label={store.itemName(item)}
                                                    size="small"
                                                    component={RouterLink}
                                                    to={`/items/${encodeURIComponent(item.id)}`}
                                                    clickable
                                                />
                                            ))
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })}
                </Box>
            )}
        </Stack>
    );
}
