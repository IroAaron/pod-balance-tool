import { useMemo, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { Autocomplete, Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";

export default function BuildDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const store = useStore();
    const build = id ? store.getBuild(id) : undefined;

    const [name, setName] = useState(build?.name ?? "");
    const [icon, setIcon] = useState(build?.icon ?? "");
    const [description, setDescription] = useState(build?.description ?? "");
    const [dirty, setDirty] = useState(false);

    const itemsById = useMemo(() => new Map(store.items.map((item) => [item.id, item])), [store.items]);

    if (!build) {
        return (
            <Stack spacing={2}>
                <Typography variant="h5">Билд не найден</Typography>
                <Button component={RouterLink} to="/builds">
                    ← К списку билдов
                </Button>
            </Stack>
        );
    }

    const handleSave = () => {
        store.upsertBuild({ ...build, name, icon, description, auto: false });
        setDirty(false);
    };

    const handleDelete = () => {
        store.deleteBuild(build.id);
        navigate("/builds");
    };

    const availableItems = store.items.filter((item) => !build.items.includes(item.id));

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Button component={RouterLink} to="/builds" size="small" sx={{ alignSelf: "flex-start" }}>
                ← К списку билдов
            </Button>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                        {build.auto && <Chip label="Черновик" color="warning" size="small" />}
                        <Box sx={{ flex: 1 }} />
                        <Button color="error" onClick={handleDelete}>
                            Удалить билд
                        </Button>
                    </Stack>

                    <Stack direction="row" spacing={2}>
                        <TextField
                            label="Иконка"
                            value={icon}
                            onChange={(event) => {
                                setIcon(event.target.value);
                                setDirty(true);
                            }}
                            size="small"
                            sx={{ width: 100 }}
                        />
                        <TextField
                            label="Название"
                            value={name}
                            onChange={(event) => {
                                setName(event.target.value);
                                setDirty(true);
                            }}
                            size="small"
                            fullWidth
                        />
                    </Stack>

                    <TextField
                        label="Описание / заметки"
                        value={description}
                        onChange={(event) => {
                            setDescription(event.target.value);
                            setDirty(true);
                        }}
                        multiline
                        minRows={2}
                        fullWidth
                    />

                    <Box>
                        <Button variant="contained" onClick={handleSave} disabled={!dirty}>
                            Сохранить
                        </Button>
                    </Box>
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Предметы ({build.items.length})
                </Typography>

                <Stack direction="row" sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
                    {build.items.map((itemId) => {
                        const item = itemsById.get(itemId);
                        return (
                            <Chip
                                key={itemId}
                                label={item ? store.itemName(item) : itemId}
                                component={RouterLink}
                                to={`/items/${encodeURIComponent(itemId)}`}
                                clickable
                                onDelete={() => store.removeItemFromBuild(build.id, itemId)}
                            />
                        );
                    })}
                    {build.items.length === 0 && (
                        <Typography color="text.secondary">Предметы ещё не добавлены.</Typography>
                    )}
                </Stack>

                <Autocomplete
                    options={availableItems}
                    getOptionLabel={(item) => `${store.itemName(item)} (${item.id})`}
                    onChange={(_event, item) => {
                        if (item) store.addItemToBuild(build.id, item.id);
                    }}
                    renderInput={(params) => <TextField {...params} label="Добавить предмет" size="small" />}
                    value={null}
                    blurOnSelect
                />
            </Paper>
        </Stack>
    );
}
