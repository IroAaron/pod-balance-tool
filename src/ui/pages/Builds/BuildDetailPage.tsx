import { useMemo, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { Autocomplete, Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { relatedBuilds } from "../../../core/domain/relations";
import BuildIcon from "../../components/BuildIcon";
import BuildTree from "../../components/BuildTree";

type Props = {
    /** Overrides the route param — set when rendered inside DetailModal (an "internal window") instead of as a full page. */
    id?: string;
};

export default function BuildDetailPage({ id: idProp }: Props = {}) {
    const params = useParams<{ id: string }>();
    const id = idProp ?? params.id;
    const inModal = idProp !== undefined;
    const navigate = useNavigate();
    const store = useStore();
    const build = id ? store.getBuild(id) : undefined;

    const [name, setName] = useState(build?.name ?? "");
    const [icon, setIcon] = useState(build?.icon ?? "");
    const [description, setDescription] = useState(build?.description ?? "");
    const [dirty, setDirty] = useState(false);

    const itemsById = useMemo(() => new Map(store.items.map((item) => [item.id, item])), [store.items]);

    const related = useMemo(() => {
        if (!build) return [];
        return relatedBuilds(
            build.id,
            store.builds,
            store.items,
            store.mechanics,
            store.upgradeChains,
            store.replaceRules
        );
    }, [build, store.builds, store.items, store.mechanics, store.upgradeChains, store.replaceRules]);

    if (!build) {
        return (
            <Stack spacing={2}>
                <Typography variant="h5">Билд не найден</Typography>
                {!inModal && (
                    <Button component={RouterLink} to="/builds">
                        ← К списку билдов
                    </Button>
                )}
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
    const manualLinks = build.manualLinks ?? [];
    const availableBuildsForLinking = store.builds.filter(
        (other) => other.id !== build.id && !manualLinks.includes(other.id)
    );

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            {!inModal && (
                <Button component={RouterLink} to="/builds" size="small" sx={{ alignSelf: "flex-start" }}>
                    ← К списку билдов
                </Button>
            )}

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                        {build.auto && <Chip label="Черновик" color="warning" size="small" />}
                        <Box sx={{ flex: 1 }} />
                        <Button color="error" onClick={handleDelete}>
                            Удалить билд
                        </Button>
                    </Stack>

                    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                        <BuildIcon build={{ ...build, icon }} size={40} />
                        <TextField
                            label="Иконка"
                            value={icon}
                            onChange={(event) => {
                                setIcon(event.target.value);
                                setDirty(true);
                            }}
                            size="small"
                            placeholder="по умолчанию — спрайт корневого предмета"
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
                                onDelete={(event) => {
                                    // Without this, the click "leaks" through to the Link and opens the item card too.
                                    event.stopPropagation();
                                    event.preventDefault();
                                    store.removeItemFromBuild(build.id, itemId);
                                }}
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

            {build.items.length > 0 && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Дерево связей
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Ступени прямых/непрямых связей между предметами билда, от головного предмета (первого в
                        списке) вниз.
                    </Typography>
                    <BuildTree build={build} />
                </Paper>
            )}

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Связи с другими билдами ({manualLinks.length})
                </Typography>

                <Stack direction="row" sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
                    {manualLinks.map((linkedId) => {
                        const linkedBuild = store.getBuild(linkedId);
                        return (
                            <Chip
                                key={linkedId}
                                label={linkedBuild ? `${linkedBuild.icon || "🧠"} ${linkedBuild.name || "Без названия"}` : linkedId}
                                component={RouterLink}
                                to={`/builds/${encodeURIComponent(linkedId)}`}
                                clickable
                                onDelete={(event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    store.unlinkBuilds(build.id, linkedId);
                                }}
                            />
                        );
                    })}
                    {manualLinks.length === 0 && (
                        <Typography color="text.secondary">Связей ещё нет.</Typography>
                    )}
                </Stack>

                <Autocomplete
                    options={availableBuildsForLinking}
                    getOptionLabel={(other) => `${other.icon || "🧠"} ${other.name || "Без названия"}`}
                    onChange={(_event, other) => {
                        if (other) store.linkBuilds(build.id, other.id);
                    }}
                    renderInput={(params) => <TextField {...params} label="Связать с билдом" size="small" />}
                    value={null}
                    blurOnSelect
                />
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Возможно связано с
                </Typography>
                {related.length === 0 ? (
                    <Typography color="text.secondary">Связанные билды не найдены.</Typography>
                ) : (
                    <Stack spacing={1}>
                        {related.map((rel) => {
                            const relatedBuild = store.getBuild(rel.id);
                            if (!relatedBuild) return null;
                            return (
                                <Stack
                                    key={rel.id}
                                    direction="row"
                                    spacing={1}
                                    component={RouterLink}
                                    to={`/builds/${encodeURIComponent(rel.id)}`}
                                    sx={{ textDecoration: "none", color: "inherit", alignItems: "center" }}
                                >
                                    <Chip
                                        label={`${relatedBuild.icon || "🧠"} ${relatedBuild.name || "Без названия"}`}
                                        size="small"
                                    />
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
