import { useMemo, useState } from "react";
import {
    Alert,
    AlertTitle,
    Box,
    Checkbox,
    Chip,
    FormControlLabel,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import { useStore } from "../../../hooks/useStore";
import DetailModal from "../../../components/DetailModal";
import ItemDetailPage from "../../Items/ItemDetailPage";
import { computeUpgradeTierIds } from "../../../../core/domain/relations";
import {
    BALANCED_COLUMNS,
    RARITY_ORDER,
    findTrendIssues,
    summarizeByRarity,
} from "../../../../core/domain/rarityBalance";
import { ITEM_KINDS } from "../../../components/content/itemSchema";
import RarityDistributionChart from "./RarityDistributionChart";
import TierFormulaPanel from "./TierFormulaPanel";
import ValuesTable from "./ValuesTable";
import type { Item } from "../../../../core/models/Item";

const HELP = `Ящик — середина выборки (от p25 до p75), жирная линия внутри — медиана, усы — минимум и максимум, точки — сами предметы.
Две редкости, чьи ящики стоят на одной высоте, игрок различить не сможет: типичный «редкий» предмет будет выдавать столько же, сколько типичный «обычный».
Поэтому предупреждения ниже ругаются не только на упавшую медиану, но и на перекрытие ящиков.`;

/**
 * «Значения» — ручная балансировка ValueMin/ValueMax/MoneyValue/Overheat с оглядкой на редкость.
 *
 * The page is built around one question: can a player tell rarities apart by the numbers? Hence the layout —
 * distribution per rarity on top (where the answer is visible at a glance), the editable rows underneath, and
 * the tier formula between them, since changing a first tier is usually followed by re-deriving its upgrades.
 */
export default function ValuesPage() {
    const store = useStore();

    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<string[]>(["Card"]);
    const [rarityFilter, setRarityFilter] = useState<string[]>([]);
    const [includeUpgradeTiers, setIncludeUpgradeTiers] = useState(false);
    const [unlinkedIds, setUnlinkedIds] = useState<Set<string>>(new Set());
    const [openItemId, setOpenItemId] = useState<string | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);

    const upgradeTierIds = useMemo(
        () => computeUpgradeTierIds(store.items, store.upgradeChains, (item) => store.itemName(item)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [store.items, store.upgradeChains, store.version]
    );

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();

        return store.items.filter((item) => {
            if (typeFilter.length > 0 && !typeFilter.includes(item.itemType ?? "")) return false;

            const rarity = (item.raw.Rarity ?? "").trim();
            if (rarityFilter.length > 0 && !rarityFilter.includes(rarity || "—")) return false;
            if (!includeUpgradeTiers && upgradeTierIds.has(item.id)) return false;

            if (!needle) return true;
            return (
                item.id.toLowerCase().includes(needle) ||
                store.itemName(item).toLowerCase().includes(needle) ||
                (store.itemDescription(item) ?? "").toLowerCase().includes(needle)
            );
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, store.version, query, typeFilter, rarityFilter, includeUpgradeTiers, upgradeTierIds]);

    /**
     * Chains for the formula panel, built from what's in scope. Note this deliberately uses the *filter* rather
     * than `filtered`: with «Отображать прокачку?» off the tiers are hidden from the table, but they're exactly
     * what the formula writes to, so hiding them mustn't put them out of reach.
     */
    const chains = useMemo(() => {
        const inScope = new Set(filtered.map((item) => item.id));
        const result: Item[][] = [];

        for (const chain of store.upgradeChains) {
            if (!chain.itemIds.some((id) => inScope.has(id))) continue;
            const tiers = chain.itemIds
                .map((id) => store.getItem(id))
                .filter((item): item is Item => Boolean(item));
            if (tiers.length >= 2) result.push(tiers);
        }

        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, store.version, filtered]);

    const charts = useMemo(
        () =>
            BALANCED_COLUMNS.map((entry) => {
                const stats = summarizeByRarity(filtered, entry.column);
                const issues = findTrendIssues(stats);
                return { entry, stats, issues };
            }),
        [filtered]
    );

    const allIssues = charts.flatMap(({ entry, issues }) => issues.map((issue) => ({ column: entry.label, issue })));

    const rarityOptions = useMemo(() => {
        const present = new Set(store.items.map((item) => (item.raw.Rarity ?? "").trim() || "—"));
        return [...RARITY_ORDER.filter((rarity) => present.has(rarity)), ...(present.has("—") ? ["—"] : [])];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, store.version]);

    const toggleLink = (itemId: string) =>
        setUnlinkedIds((current) => {
            const next = new Set(current);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });

    return (
        <Stack spacing={2.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="h4">Значения</Typography>
                <Tooltip title="Как читать графики" open={helpOpen} onClose={() => setHelpOpen(false)}>
                    <IconButton
                        size="small"
                        aria-label="Как читать графики"
                        onClick={() => setHelpOpen((open) => !open)}
                    >
                        <HelpOutlineIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Stack>

            {helpOpen && (
                <Alert severity="info" onClose={() => setHelpOpen(false)}>
                    {HELP.split("\n").map((line) => (
                        <Typography key={line} variant="body2">
                            {line}
                        </Typography>
                    ))}
                </Alert>
            )}

            <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 2, alignItems: "center" }}>
                    <TextField
                        size="small"
                        label="Поиск"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        sx={{ width: 240 }}
                    />

                    <Select
                        size="small"
                        multiple
                        displayEmpty
                        value={typeFilter}
                        onChange={(event) =>
                            setTypeFilter(
                                typeof event.target.value === "string"
                                    ? event.target.value.split(",")
                                    : event.target.value
                            )
                        }
                        renderValue={(selected) => (selected.length ? selected.join(", ") : "Тип: все")}
                        sx={{ minWidth: 180 }}
                    >
                        {ITEM_KINDS.map((kind) => (
                            <MenuItem key={kind} value={kind}>
                                <Checkbox size="small" checked={typeFilter.includes(kind)} />
                                {kind}
                            </MenuItem>
                        ))}
                    </Select>

                    <Select
                        size="small"
                        multiple
                        displayEmpty
                        value={rarityFilter}
                        onChange={(event) =>
                            setRarityFilter(
                                typeof event.target.value === "string"
                                    ? event.target.value.split(",")
                                    : event.target.value
                            )
                        }
                        renderValue={(selected) => (selected.length ? selected.join(", ") : "Редкость: все")}
                        sx={{ minWidth: 200 }}
                    >
                        {rarityOptions.map((rarity) => (
                            <MenuItem key={rarity} value={rarity}>
                                <Checkbox size="small" checked={rarityFilter.includes(rarity)} />
                                {rarity === "—" ? "без редкости" : rarity}
                            </MenuItem>
                        ))}
                    </Select>

                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={includeUpgradeTiers}
                                onChange={(event) => setIncludeUpgradeTiers(event.target.checked)}
                            />
                        }
                        label="Отображать прокачку?"
                    />

                    <Chip label={`Строк: ${filtered.length}`} size="small" />
                </Stack>
            </Paper>

            {allIssues.length > 0 && (
                <Alert severity="warning">
                    <AlertTitle>Редкости плохо различимы по числам</AlertTitle>
                    {allIssues.map(({ column, issue }) => (
                        <Typography key={`${column}-${issue.rarity}-${issue.kind}`} variant="body2">
                            <b>{column}</b> · {issue.rarity}: {issue.detail}
                        </Typography>
                    ))}
                </Alert>
            )}

            <Paper variant="outlined" sx={{ p: 2 }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
                        gap: 3,
                    }}
                >
                    {charts.map(({ entry, stats, issues }) => (
                        <RarityDistributionChart
                            key={entry.column}
                            title={entry.label}
                            stats={stats}
                            flaggedRarities={new Set(issues.map((issue) => issue.rarity))}
                        />
                    ))}
                </Box>
            </Paper>

            <TierFormulaPanel chains={chains} />

            <Paper variant="outlined">
                <ValuesTable
                    items={filtered}
                    unlinkedIds={unlinkedIds}
                    onToggleLink={toggleLink}
                    onOpenItem={setOpenItemId}
                />
            </Paper>

            <Typography variant="caption" color="text.secondary">
                Правки видны на сайте сразу, а в таблицу конфигурации уходят кнопкой «Экспортировать в конфиг» на
                странице «Источники».
            </Typography>

            <DetailModal open={Boolean(openItemId)} onClose={() => setOpenItemId(null)}>
                {openItemId && <ItemDetailPage id={openItemId} />}
            </DetailModal>
        </Stack>
    );
}
