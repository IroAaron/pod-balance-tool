import { useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Card,
    CardActionArea,
    CardContent,
    Chip,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import type { BuildSortKey } from "../../../core/services/BuildService";

export default function BuildsPage() {
    const store = useStore();
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
    const [sortKey, setSortKey] = useState<BuildSortKey>("name");
    const [suggestMessage, setSuggestMessage] = useState<string | null>(null);

    const filtered = useMemo(() => {
        let result = store.buildService.search(store.builds, query);
        result = store.buildService.sort(result, sortKey);
        return result;
        // buildService is a stable method on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.builds, query, sortKey]);

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

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
                <TextField
                    label="Поиск"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    size="small"
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
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 2,
                }}
            >
                {filtered.map((build) => (
                    <Card key={build.id} variant="outlined">
                        <CardActionArea
                            component={RouterLink}
                            to={`/builds/${encodeURIComponent(build.id)}`}
                            sx={{ height: "100%" }}
                        >
                            <CardContent>
                                <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
                                    <Typography variant="h5">{build.icon || "🧠"}</Typography>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                        {build.name || "Без названия"}
                                    </Typography>
                                    {build.auto && <Chip label="Черновик" size="small" color="warning" />}
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                    Предметов: {build.items.length}
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                ))}
            </Box>

            {store.builds.length === 0 && (
                <Typography color="text.secondary">
                    Билдов пока нет. Создайте вручную или нажмите «Предложить билды», когда загрузите данные.
                </Typography>
            )}
        </Stack>
    );
}
