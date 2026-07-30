import { useCallback, useMemo, useState } from "react";
import { Autocomplete, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import DetailModal from "../../components/DetailModal";
import ItemDetailPage from "../Items/ItemDetailPage";
import BuildDetailPage from "../Builds/BuildDetailPage";
import { computeUpgradeTierIds } from "../../../core/domain/relations";
import { computeItemPowers } from "../../../core/domain/balance";
import type { Item } from "../../../core/models/Item";

function fmt(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * "Проверка формулы" — lets the user pick one item and see exactly the S/M inputs computeItemPowers actually
 * computed for it: the qualifying builds (S, filtered by balanceConfig.qualifyingBuildDepthThreshold/N), the
 * item's own ступень in each, that build's per-build direct scalers, and the deduplicated M set across all of
 * S. Deliberately reuses computeItemPowers directly (not a parallel re-implementation) so this view can never
 * drift from what the "Сила" formula on the other tab actually used.
 */
export default function FormulaCheckTab() {
    const store = useStore();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [openItemId, setOpenItemId] = useState<string | null>(null);
    const [openBuildId, setOpenBuildId] = useState<string | null>(null);

    // itemName reads live translations at call time, so this stable wrapper stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const resolveName = useCallback((item: Item) => store.itemName(item), []);

    const baseItems = useMemo(() => {
        const tierIds = computeUpgradeTierIds(store.items, store.upgradeChains, resolveName);
        return store.items.filter((item) => !tierIds.has(item.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.items, store.translations, store.upgradeChains]);

    const powers = useMemo(
        () =>
            computeItemPowers(
                baseItems,
                store.builds,
                store.mechanics,
                store.replaceRules,
                store.upgradeChains,
                store.balanceConfig
            ),
        [baseItems, store.builds, store.mechanics, store.replaceRules, store.upgradeChains, store.balanceConfig]
    );

    const selectedItem = selectedId ? (store.getItem(selectedId) ?? null) : null;
    const power = selectedId ? powers.get(selectedId) : undefined;

    const renderScalerChip = (itemId: string) => {
        const item = store.getItem(itemId);
        return (
            <Chip
                key={itemId}
                icon={item ? <ItemIcon item={item} size={20} /> : undefined}
                label={item ? resolveName(item) : itemId}
                onClick={() => setOpenItemId(itemId)}
                clickable
                variant="outlined"
                size="small"
            />
        );
    };

    return (
        <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
                Выбери предмет — покажем ровно те билды, ступени и скейлеры, которые реально ушли в расчёт его
                «Силы» (S и M), чтобы можно было вручную сверить формулу.
            </Typography>

            <Autocomplete
                options={baseItems}
                getOptionLabel={(item) => `${resolveName(item)} (${item.id})`}
                value={selectedItem}
                onChange={(_event, value) => setSelectedId(value?.id ?? null)}
                renderInput={(params) => <TextField {...params} label="Предмет" size="small" />}
                sx={{ maxWidth: 420 }}
            />

            {!selectedItem && (
                <Typography color="text.secondary">Выбери предмет из списка выше.</Typography>
            )}

            {selectedItem && power && (
                <>
                    <Typography variant="body2" color="text.secondary">
                        N (порог ступени) = {store.balanceConfig.qualifyingBuildDepthThreshold}. Билдов на ступени ≤
                        N: {power.qualifyingBuildCount}.
                    </Typography>

                    <Stack spacing={2}>
                        {power.qualifyingBuildEntries.map((entry) => (
                            <Paper key={entry.buildId} variant="outlined" sx={{ p: 2 }}>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                                    <Typography
                                        variant="subtitle2"
                                        sx={{ cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                                        onClick={() => setOpenBuildId(entry.buildId)}
                                    >
                                        {entry.buildName || entry.buildId}
                                    </Typography>
                                    <Chip label={`ступень ${entry.depth}`} size="small" color="primary" variant="outlined" />
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                    Q={fmt(entry.q)} × V={fmt(entry.v)} = {fmt(entry.product)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                                    Прямые скейлеры выбранного предмета в этом билде:
                                </Typography>
                                {entry.scalerItemIds.length > 0 ? (
                                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                                        {entry.scalerItemIds.map(renderScalerChip)}
                                    </Stack>
                                ) : (
                                    <Typography variant="caption" color="text.secondary">
                                        Нет прямых связей в этом билде
                                    </Typography>
                                )}
                            </Paper>
                        ))}
                        {power.qualifyingBuildEntries.length === 0 && (
                            <Typography color="text.secondary">Нет билдов на ступени ≤ N для этого предмета.</Typography>
                        )}
                    </Stack>

                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Уникальные скейлеры из билдов S (M = {power.directConnectionsCount})
                        </Typography>
                        {power.directConnectionItemIds.length > 0 ? (
                            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                                {power.directConnectionItemIds.map(renderScalerChip)}
                            </Stack>
                        ) : (
                            <Typography variant="caption" color="text.secondary">Нет</Typography>
                        )}
                    </Paper>
                </>
            )}

            <DetailModal open={openItemId !== null} onClose={() => setOpenItemId(null)}>
                {openItemId && <ItemDetailPage id={openItemId} />}
            </DetailModal>
            <DetailModal open={openBuildId !== null} onClose={() => setOpenBuildId(null)}>
                {openBuildId && <BuildDetailPage id={openBuildId} />}
            </DetailModal>
        </Stack>
    );
}
