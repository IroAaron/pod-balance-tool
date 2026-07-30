import { useCallback, useMemo, useState } from "react";
import {
    Autocomplete,
    Box,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import DetailModal from "../../components/DetailModal";
import ItemDetailPage from "../Items/ItemDetailPage";
import { computeUpgradeTierIds } from "../../../core/domain/relations";
import { computeItemPowers, type ItemPower } from "../../../core/domain/balance";
import { computeShopAppearanceProbabilities } from "../../../core/domain/shopProbability";
import type { Item } from "../../../core/models/Item";

type SortKey = "power" | "mechanicPower" | "name";

type SortDirection = "asc" | "desc";

function fmt(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function PowerTooltipContent({ power }: { power: ItemPower }) {
    return (
        <Stack spacing={0.5} sx={{ p: 0.5, maxWidth: 320 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Сила = (MoneyValue + avg) + avg×(1+P) + avg×Σкоэф.билдов
            </Typography>
            <Typography variant="caption">MoneyValue: {fmt(power.moneyValue)}</Typography>
            <Typography variant="caption">avg = (Min+Max)/2: {fmt(power.averageValue)}</Typography>
            <Typography variant="caption">
                P: {fmt(power.probability)} ({power.probabilityIsAuto ? "авто, Σ по прямым скейлерам" : "константа из «Констант»"}) →
                avg×(1+P) = {fmt(power.probabilityTerm)}
            </Typography>
            {power.probabilitySources.length > 0 && (
                <Stack sx={{ mt: 0.5 }}>
                    {power.probabilitySources.map((source, index) => (
                        <Typography key={`${source.itemId}-${index}`} variant="caption">
                            • скейлер «{source.itemId}» ({source.buildName || source.buildId}) —{" "}
                            {fmt(source.probability)}
                        </Typography>
                    ))}
                </Stack>
            )}
            <Typography variant="caption">
                Σ коэф. по билдам: {fmt(power.buildCoefficientSum)} → avg×Σ = {fmt(power.buildTerm)}
            </Typography>
            {power.buildPresence.length > 0 && (
                <Stack sx={{ mt: 0.5 }}>
                    {power.buildPresence.map((entry, index) => (
                        <Typography key={`${entry.buildId}-${index}`} variant="caption">
                            • {entry.buildName || entry.buildId} — ступень {entry.depth} (×{fmt(entry.coefficient)})
                        </Typography>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}

function MechanicPowerTooltipContent({ power }: { power: ItemPower }) {
    return (
        <Stack spacing={0.5} sx={{ p: 0.5, maxWidth: 320 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Сила (мех.) = MoneyValue + [avg×Σ(TargetCount MechAddValue)×Влияние + Σ(TargetCount T)×Влияние(T)]
                ×(1+P) + avg×Σкоэф.билдов
            </Typography>
            <Typography variant="caption">MoneyValue: {fmt(power.moneyValue)}</Typography>
            {power.mechanicTerms.length > 0 ? (
                <Stack sx={{ mt: 0.5 }}>
                    {power.mechanicTerms.map((term, index) => (
                        <Typography key={`${term.table}-${index}`} variant="caption">
                            • {term.table}: TargetCount {fmt(term.targetCountSum)} × Влияние {fmt(term.influence)} →{" "}
                            {fmt(term.term)}
                        </Typography>
                    ))}
                </Stack>
            ) : (
                <Typography variant="caption" color="text.secondary">
                    Нет механик с TargetCount &gt; 0
                </Typography>
            )}
            <Typography variant="caption">
                Σ механик: {fmt(power.mechanicTermsSum)} × (1+P), P {fmt(power.probability)} (
                {power.probabilityIsAuto ? "авто, Σ по прямым скейлерам" : "константа из «Констант»"}) →{" "}
                {fmt(power.mechanicTermsWithProbability)}
            </Typography>
            <Typography variant="caption">
                Σ коэф. по билдам: {fmt(power.buildCoefficientSum)} → avg×Σ = {fmt(power.buildTerm)}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600, mt: 0.5 }}>
                Итого: {fmt(power.mechanicPower)}
            </Typography>
        </Stack>
    );
}

/**
 * "Сила предметов" — search + sort over every item's computed power (see domain/balance.ts), excluding upgrade
 * tiers unconditionally (per explicit request — unlike the Items page, there's no toggle to show them here). A
 * click opens the item's detail page as an overlay (DetailModal), same "внутреннее окно" pattern BuildsPage/
 * GraphPage/BuildTree already use.
 */
export default function ItemPowerTab() {
    const store = useStore();
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<string[]>([]);
    const [sortKey, setSortKey] = useState<SortKey>("power");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
    const [openItemId, setOpenItemId] = useState<string | null>(null);

    // itemName reads live translations at call time, so this stable wrapper stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const resolveName = useCallback((item: Item) => store.itemName(item), []);

    const baseItems = useMemo(() => {
        const tierIds = computeUpgradeTierIds(store.items, store.upgradeChains, resolveName);
        return store.items.filter((item) => !tierIds.has(item.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.items, store.translations, store.upgradeChains]);

    // Real item types present in the data (not store.paramValues.ItemType, which also aggregates unrelated
    // mechanic-field values like "PlayerScore" — see BuildsPage's BUILD_TYPE_OPTIONS for the same caveat).
    const availableTypes = useMemo(
        () => [...new Set(baseItems.map((item) => item.itemType).filter((type): type is string => Boolean(type)))].sort(),
        [baseItems]
    );

    const shopAppearances = useMemo(
        () => computeShopAppearanceProbabilities(store.packs, store.shopDecks),
        [store.packs, store.shopDecks]
    );

    const powers = useMemo(
        () =>
            computeItemPowers(
                baseItems,
                store.builds,
                store.mechanics,
                store.replaceRules,
                store.upgradeChains,
                store.balanceConfig,
                shopAppearances
            ),
        [baseItems, store.builds, store.mechanics, store.replaceRules, store.upgradeChains, store.balanceConfig, shopAppearances]
    );

    const filtered = useMemo(() => {
        let result = store.itemService.search(baseItems, query, resolveName);
        if (typeFilter.length > 0) {
            result = result.filter((item) => item.itemType && typeFilter.includes(item.itemType));
        }
        const sign = sortDirection === "desc" ? -1 : 1;
        return [...result].sort((a, b) => {
            if (sortKey === "name") return sign * resolveName(a).localeCompare(resolveName(b));
            const key = sortKey === "mechanicPower" ? "mechanicPower" : "power";
            const powerA = powers.get(a.id)?.[key] ?? 0;
            const powerB = powers.get(b.id)?.[key] ?? 0;
            return sign * (powerA - powerB || resolveName(a).localeCompare(resolveName(b)));
        });
        // itemService is a stable method on the long-lived store singleton.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseItems, query, typeFilter, sortKey, sortDirection, powers, resolveName]);

    return (
        <Stack spacing={3}>
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
                    options={availableTypes}
                    value={typeFilter}
                    onChange={(_event, value) => setTypeFilter(value)}
                    renderInput={(params) => <TextField {...params} label="Типы" />}
                    sx={{ minWidth: 240 }}
                />

                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <TextField
                        select
                        label="Сортировка"
                        value={sortKey}
                        onChange={(event) => setSortKey(event.target.value as SortKey)}
                        size="small"
                        sx={{ minWidth: 160 }}
                    >
                        <MenuItem value="power">По силе</MenuItem>
                        <MenuItem value="mechanicPower">По силе (мех.)</MenuItem>
                        <MenuItem value="name">По названию</MenuItem>
                    </TextField>

                    <Tooltip title={sortDirection === "asc" ? "По возрастанию" : "По убыванию"}>
                        <IconButton
                            size="small"
                            aria-label="Направление сортировки"
                            onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                        >
                            {sortDirection === "asc" ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Stack>

            <Typography variant="body2" color="text.secondary">
                Найдено: {filtered.length} из {baseItems.length}
            </Typography>

            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Предмет</TableCell>
                            <TableCell>Id</TableCell>
                            <TableCell align="right">Сила</TableCell>
                            <TableCell align="right">Сила (мех.)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filtered.map((item) => {
                            const power = powers.get(item.id);
                            return (
                                <TableRow
                                    key={item.id}
                                    hover
                                    onClick={() => setOpenItemId(item.id)}
                                    sx={{ cursor: "pointer" }}
                                >
                                    <TableCell>
                                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                            <ItemIcon item={item} size={28} />
                                            <Typography variant="body2">{resolveName(item)}</Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption" color="text.secondary">
                                            {item.id}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        {power && (
                                            <Tooltip title={<PowerTooltipContent power={power} />} arrow>
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        fontWeight: 700,
                                                        cursor: "help",
                                                        borderBottom: "1px dotted",
                                                        borderColor: "text.disabled",
                                                    }}
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    {fmt(power.power)}
                                                </Box>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        {power && (
                                            <Tooltip title={<MechanicPowerTooltipContent power={power} />} arrow>
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        fontWeight: 700,
                                                        cursor: "help",
                                                        borderBottom: "1px dotted",
                                                        borderColor: "text.disabled",
                                                    }}
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    {fmt(power.mechanicPower)}
                                                </Box>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {baseItems.length === 0 && (
                <Typography color="text.secondary">Данных пока нет — загрузите их на странице «Источники».</Typography>
            )}

            <DetailModal open={openItemId !== null} onClose={() => setOpenItemId(null)}>
                {openItemId && <ItemDetailPage id={openItemId} />}
            </DetailModal>
        </Stack>
    );
}
