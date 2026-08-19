import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Divider, Link, Paper, Stack, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import { getItemSpriteFileName, SPRITE_BASE_PATH } from "../../../core/domain/sprites";
import { findUpgradeDescriptionMismatches } from "../../../core/domain/upgradeConsistency";
import { findItemsWithoutDescription } from "../../../core/domain/contentGaps";

export default function AnalyticsPage() {
    const store = useStore();
    const [manifest, setManifest] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch(`${SPRITE_BASE_PATH}manifest.json`)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<string[]>;
            })
            .then((files) => {
                if (!cancelled) setManifest(files);
            })
            .catch((fetchError) => {
                if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const usedSpriteNames = new Set(
        store.allItems.map((item) => getItemSpriteFileName(item)).filter((name): name is string => Boolean(name))
    );

    const unusedSprites = (manifest ?? []).filter((file) => !usedSpriteNames.has(file));

    const descriptionMismatches = findUpgradeDescriptionMismatches(
        store.upgradeChains,
        (id) => store.getItem(id),
        (item) => store.itemDescription(item)
    );

    const itemsWithoutDescription = findItemsWithoutDescription(store.items, (item) => store.itemDescription(item));

    // An item missing its name too isn't really a description gap — it has no translation row at all (the known
    // id-mismatch group, see README). Worth separating: on the real config that's most of this list, and mixing
    // the two would bury the handful of items that do have a name and just need a description written.
    const untranslatedIds = new Set(
        itemsWithoutDescription
            .filter(({ item }) => store.getTranslation(item.nameKey) === undefined)
            .map(({ item }) => item.id)
    );

    return (
        <Stack spacing={3}>
            <Typography variant="h4">Разное</Typography>

            <Stack spacing={0.5}>
                <Typography variant="h6">Расхождения в описаниях прокачек</Typography>
                <Typography variant="body2" color="text.secondary">
                    Предметы одной цепочки прокачки (+/++) должны использовать один и тот же шаблон описания —
                    числа подставляются сами через токены вроде {"{ValueOrRange}"}. Здесь цепочки, где различается
                    сам текст шаблона, а не подставляемые значения. Пробелы по краям не учитываются.
                </Typography>
            </Stack>

            {store.upgradeChains.length === 0 ? (
                <Typography color="text.secondary">
                    Цепочки прокачки не загружены — скачайте конфиг на странице «Источники».
                </Typography>
            ) : descriptionMismatches.length === 0 ? (
                <Typography color="text.secondary">
                    Расхождений не найдено — во всех {store.upgradeChains.length} цепочках описания совпадают.
                </Typography>
            ) : (
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        Найдено расхождений: {descriptionMismatches.length} из {store.upgradeChains.length} цепочек.
                    </Typography>

                    {descriptionMismatches.map((mismatch) => (
                        <Paper key={mismatch.chainId} variant="outlined" sx={{ p: 2 }}>
                            <Stack spacing={1.5} divider={<Divider flexItem />}>
                                {mismatch.tiers.map((tier) => (
                                    <Stack key={tier.item.id} direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                                        <Box sx={{ flexShrink: 0, pt: 0.25 }}>
                                            <ItemIcon item={tier.item} size={32} />
                                        </Box>

                                        <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
                                            <Link
                                                component={RouterLink}
                                                to={`/items/${encodeURIComponent(tier.item.id)}`}
                                                variant="body2"
                                                sx={{ fontWeight: tier.matchesFirst ? 400 : 600 }}
                                            >
                                                {store.itemName(tier.item)}
                                            </Link>
                                            <Typography variant="caption" color="text.secondary">
                                                {tier.item.id}
                                            </Typography>
                                            <Typography
                                                variant="body2"
                                                component="pre"
                                                sx={{
                                                    m: 0,
                                                    fontFamily: "monospace",
                                                    fontSize: 13,
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-word",
                                                    color: tier.matchesFirst ? "text.secondary" : "warning.main",
                                                }}
                                            >
                                                {tier.description || "(описание пустое)"}
                                            </Typography>
                                        </Stack>
                                    </Stack>
                                ))}
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}

            <Divider />

            <Stack spacing={0.5}>
                <Typography variant="h6">Предметы без описания</Typography>
                <Typography variant="body2" color="text.secondary">
                    Загруженные предметы, у которых описание пустое или состоит из одних пробелов. Ячейка с
                    пробелом в таблице выглядит заполненной, но на сайте не показывает ничего — такие отмечены
                    отдельно.
                </Typography>
            </Stack>

            {store.items.length === 0 ? (
                <Typography color="text.secondary">
                    Предметы не загружены — скачайте конфиг и переводы на странице «Источники».
                </Typography>
            ) : itemsWithoutDescription.length === 0 ? (
                <Typography color="text.secondary">
                    Все {store.items.length} предметов имеют описание.
                </Typography>
            ) : (
                <Stack spacing={1.5}>
                    <Typography variant="body2" color="text.secondary">
                        Без описания: {itemsWithoutDescription.length} из {store.items.length}
                        {(() => {
                            const blanks = itemsWithoutDescription.filter((entry) => entry.kind === "whitespace").length;
                            return blanks > 0 ? `, из них ${blanks} с пробелом вместо текста` : "";
                        })()}
                        {untranslatedIds.size > 0 &&
                            `, и ${untranslatedIds.size} без названия — у них вообще нет строки в переводах, это не про описание`}
                        .
                    </Typography>

                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                            gap: 1,
                        }}
                    >
                        {itemsWithoutDescription.map(({ item, kind }) => (
                            <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                                <Box sx={{ flexShrink: 0 }}>
                                    <ItemIcon item={item} size={28} />
                                </Box>
                                <Stack spacing={0} sx={{ minWidth: 0 }}>
                                    <Link
                                        component={RouterLink}
                                        to={`/items/${encodeURIComponent(item.id)}`}
                                        variant="body2"
                                        noWrap
                                        sx={{ color: untranslatedIds.has(item.id) ? "text.secondary" : undefined }}
                                    >
                                        {store.itemName(item)}
                                        {kind === "whitespace" && " ␣"}
                                    </Link>
                                    <Typography variant="caption" color="text.secondary" noWrap>
                                        {untranslatedIds.has(item.id) ? "нет названия — нет строки в переводах" : item.id}
                                    </Typography>
                                </Stack>
                            </Stack>
                        ))}
                    </Box>
                </Stack>
            )}

            <Divider />

            <Stack spacing={0.5}>
                <Typography variant="h6">Неиспользуемые спрайты</Typography>
                <Typography variant="body2" color="text.secondary">
                    Файлы из public/roulette_interface/pod-mini-characters, на которые не ссылается ни один загруженный предмет
                    (колонка CardSpriteNameMini).
                </Typography>
            </Stack>

            {error && <Alert severity="error">Не удалось загрузить список спрайтов: {error}</Alert>}

            {manifest && (
                <Typography variant="body2" color="text.secondary">
                    Неиспользуемых: {unusedSprites.length} из {manifest.length}
                </Typography>
            )}

            {manifest && unusedSprites.length === 0 && (
                <Typography color="text.secondary">Неиспользуемых спрайтов не найдено.</Typography>
            )}

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 2,
                }}
            >
                {unusedSprites.map((file) => (
                    <Stack key={file} spacing={0.5} sx={{ alignItems: "center" }}>
                        <img
                            src={`${SPRITE_BASE_PATH}${encodeURIComponent(file)}`}
                            alt={file}
                            width={64}
                            height={64}
                            style={{ objectFit: "contain" }}
                        />
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ textAlign: "center", wordBreak: "break-all" }}
                        >
                            {file}
                        </Typography>
                    </Stack>
                ))}
            </Box>
        </Stack>
    );
}
