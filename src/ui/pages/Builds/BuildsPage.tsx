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
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    IconButton,
    MenuItem,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import ItemDescription from "../../components/ItemDescription";
import BuildIcon from "../../components/BuildIcon";
import DetailModal from "../../components/DetailModal";
import ItemDetailPage from "../Items/ItemDetailPage";
import { computeCascadeLevels, higherTierIds } from "../../../core/domain/relations";
import type { BuildSortKey } from "../../../core/services/BuildService";

// Same three literal category names normalize.ts assigns as item.itemType for Cards/Houses/Artefacts —
// deliberately not store.paramValues.ItemType, which also aggregates ActivatorTargetType/TargetType/
// BonusTargetType mechanic values (e.g. "PlayerScore") and would pollute this filter with non-categories.
const BUILD_TYPE_OPTIONS = ["Artefact", "Card", "House"];

// Root (depth 0) + the first 2 hops out (depth 1/2) — a card is a compact preview, not the full "Дерево связей";
// deeper members are real but increasingly indirect (see computeCascadeLevels), so cutting them from the card
// isn't hiding information the same way an arbitrary item-count cap would.
const MAX_CARD_PREVIEW_DEPTH = 2;

/** Russian plural form for "N предмет(а/ов)" — 1 предмет, 2-4 предмета, 5+/11-14 предметов. */
function itemsWord(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "предмет";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "предмета";
    return "предметов";
}

export default function BuildsPage() {
    const store = useStore();
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<string[]>([]);
    const [sortKey, setSortKey] = useState<BuildSortKey>("name");
    const [suggestMessage, setSuggestMessage] = useState<string | null>(null);
    const [openItemId, setOpenItemId] = useState<string | null>(null);
    const [includeUpgradeTiers, setIncludeUpgradeTiers] = useState(false);
    const [includeMoneyValueRoots, setIncludeMoneyValueRoots] = useState(false);
    const [deleteMode, setDeleteMode] = useState(false);
    const [confirmDeleteDrafts, setConfirmDeleteDrafts] = useState(false);

    const excludedTiers = useMemo(() => higherTierIds(store.upgradeChains), [store.upgradeChains]);

    const filtered = useMemo(() => {
        let result = store.buildService.search(store.builds, query);
        if (tagFilter) {
            result = result.filter((build) =>
                build.items.some((itemId) => store.getItem(itemId)?.tags.includes(tagFilter))
            );
        }
        if (typeFilter.length > 0) {
            // "Starts with" a type = the build's first item (its root, for cascade-generated builds) is of that type.
            result = result.filter((build) => {
                const rootType = build.items[0] ? store.getItem(build.items[0])?.itemType : undefined;
                return rootType ? typeFilter.includes(rootType) : false;
            });
        }
        result = store.buildService.sort(result, sortKey);
        return result;
        // buildService/getItem are stable methods on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.builds, store.items, query, tagFilter, typeFilter, sortKey]);

    // buildId -> item id -> depth in the scaling graph (see computeCascadeLevels) — computed once per visible
    // build rather than per card render. A build with no real root (manual, or root has no PlayerScore payoff)
    // only ever classifies the root itself; every other member falls through to the card's "и ещё N" count.
    const depthByBuildAndItem = useMemo(() => {
        const map = new Map<string, Map<string, number>>();
        for (const build of filtered) {
            const { nodes } = computeCascadeLevels(build, store.items, store.mechanics, store.replaceRules);
            map.set(build.id, new Map(nodes.map((node) => [node.itemId, node.depth])));
        }
        return map;
    }, [filtered, store.items, store.mechanics, store.replaceRules]);

    const availableTags = store.paramValues.ItemTag ?? [];
    const availableTypes = BUILD_TYPE_OPTIONS;

    const toggleType = (type: string) => {
        setTypeFilter((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
    };

    const handleCreate = () => {
        const build = store.createBuild();
        navigate(`/builds/${encodeURIComponent(build.id)}`);
    };

    const handleSuggest = () => {
        const count = store.suggestBuilds(includeUpgradeTiers);
        setSuggestMessage(count > 0 ? `Добавлено черновиков: ${count}` : "Новых черновиков не найдено");
    };

    const handleSuggestCascade = () => {
        const count = store.suggestCascadeBuilds(includeUpgradeTiers, includeMoneyValueRoots);
        setSuggestMessage(
            count > 0 ? `Добавлено каскадных черновиков: ${count}` : "Новых каскадных черновиков не найдено"
        );
    };

    const handleDeleteAllDrafts = () => {
        const count = store.deleteAllDrafts();
        setConfirmDeleteDrafts(false);
        setSuggestMessage(count > 0 ? `Удалено черновиков: ${count}` : "Черновиков не найдено");
    };

    return (
        <Stack spacing={3}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <Typography variant="h4">Билды</Typography>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={deleteMode}
                            onChange={(event) => setDeleteMode(event.target.checked)}
                        />
                    }
                    label="Режим удаления"
                    sx={{ mr: 0 }}
                />
            </Stack>

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
            </Stack>

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
                <Typography variant="body2" color="text.secondary">
                    Тип билда:
                </Typography>
                {availableTypes.map((type) => (
                    <FormControlLabel
                        key={type}
                        control={
                            <Checkbox
                                size="small"
                                checked={typeFilter.includes(type)}
                                onChange={() => toggleType(type)}
                            />
                        }
                        label={type}
                        sx={{ mr: 0 }}
                    />
                ))}
                <Button size="small" onClick={() => setTypeFilter(availableTypes)} disabled={availableTypes.length === 0}>
                    Выбрать все
                </Button>
                <Button size="small" onClick={() => setTypeFilter([])} disabled={typeFilter.length === 0}>
                    Снять все
                </Button>
            </Stack>

            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                <Button variant="outlined" onClick={handleSuggest} disabled={store.items.length === 0}>
                    Предложить билды
                </Button>
                <Button variant="outlined" onClick={handleSuggestCascade} disabled={store.items.length === 0}>
                    Собрать билды от очков
                </Button>
                <Button variant="contained" onClick={handleCreate}>
                    + Создать билд
                </Button>
                <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setConfirmDeleteDrafts(true)}
                    disabled={!store.builds.some((build) => build.auto)}
                >
                    Удалить все черновики
                </Button>
            </Stack>

            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={includeUpgradeTiers}
                            onChange={(event) => setIncludeUpgradeTiers(event.target.checked)}
                        />
                    }
                    label="Учитывать прокачки (+/++)"
                    sx={{ mr: 0 }}
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={includeMoneyValueRoots}
                            onChange={(event) => setIncludeMoneyValueRoots(event.target.checked)}
                        />
                    }
                    label="Показывать билды, с MoneyValue?"
                    sx={{ mr: 0 }}
                />
            </Stack>

            <Dialog open={confirmDeleteDrafts} onClose={() => setConfirmDeleteDrafts(false)}>
                <DialogTitle>Удалить все черновики?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Будут удалены все билды с пометкой «Черновик». Действие необратимо.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDeleteDrafts(false)}>Отмена</Button>
                    <Button variant="contained" color="error" onClick={handleDeleteAllDrafts}>
                        Удалить все черновики
                    </Button>
                </DialogActions>
            </Dialog>

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

                    const itemDepths = depthByBuildAndItem.get(build.id);
                    // Not in the scaling graph at all (unclassified) counts as "beyond the preview depth" too —
                    // it's still a real member, just not one the card has room to explain, same as a deep one.
                    const previewItems = buildItems.filter(
                        (item) => (itemDepths?.get(item.id) ?? Infinity) <= MAX_CARD_PREVIEW_DEPTH
                    );
                    const hiddenItemCount = buildItems.length - previewItems.length;

                    return (
                        <Card key={build.id} variant="outlined" sx={{ position: "relative" }}>
                            {deleteMode && (
                                <IconButton
                                    size="small"
                                    aria-label="Удалить билд"
                                    onClick={(event) => {
                                        // Sibling to the CardActionArea's Link, but stop/prevent anyway in case of future nesting.
                                        event.stopPropagation();
                                        event.preventDefault();
                                        store.deleteBuild(build.id);
                                    }}
                                    sx={{
                                        position: "absolute",
                                        top: 4,
                                        right: 4,
                                        zIndex: 1,
                                        bgcolor: "background.paper",
                                        "&:hover": { bgcolor: "error.main", color: "error.contrastText" },
                                    }}
                                >
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            )}
                            <CardActionArea component={RouterLink} to={`/builds/${encodeURIComponent(build.id)}`}>
                                <CardContent sx={{ pb: 1 }}>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                        <BuildIcon build={build} size={32} />
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            {build.name || "Без названия"}
                                        </Typography>
                                        {build.auto && <Chip label="Черновик" size="small" color="warning" />}
                                    </Stack>
                                </CardContent>
                            </CardActionArea>

                            <CardContent sx={{ pt: 0 }}>
                                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
                                    {buildItems.length === 0 ? (
                                        <Typography variant="body2" color="text.secondary">
                                            Предметы не добавлены.
                                        </Typography>
                                    ) : (
                                        <>
                                            {previewItems.map((item) => {
                                                const description = store.itemDescription(item);
                                                return (
                                                    <Tooltip
                                                        key={item.id}
                                                        title={
                                                            <>
                                                                {store.itemName(item)}
                                                                {description && (
                                                                    <>
                                                                        <br />
                                                                        <ItemDescription item={item} description={description} />
                                                                    </>
                                                                )}
                                                            </>
                                                        }
                                                    >
                                                        <Box
                                                            onClick={() => setOpenItemId(item.id)}
                                                            sx={{ display: "block", lineHeight: 0, cursor: "pointer" }}
                                                        >
                                                            <ItemIcon item={item} size={36} />
                                                        </Box>
                                                    </Tooltip>
                                                );
                                            })}
                                            {hiddenItemCount > 0 && (
                                                <Typography variant="body2" color="text.secondary">
                                                    и ещё {hiddenItemCount} {itemsWord(hiddenItemCount)}
                                                </Typography>
                                            )}
                                        </>
                                    )}
                                </Stack>
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

            <DetailModal open={openItemId !== null} onClose={() => setOpenItemId(null)}>
                {openItemId && <ItemDetailPage id={openItemId} />}
            </DetailModal>
        </Stack>
    );
}
