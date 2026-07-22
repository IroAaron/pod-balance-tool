import { useState } from "react";
import { Box, Button, MenuItem, Paper, Slider, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemDescription from "../../components/ItemDescription";
import { DEFAULT_DESCRIPTION_SETTINGS, type DescriptionMode } from "../../../core/domain/descriptionTemplate";
import type { Item } from "../../../core/models/Item";

const PREVIEW_ITEM: Item = {
    id: "preview-item",
    tags: [],
    raw: { PossibleColors: "Blue, Green, Yellow, Red" },
    valueMin: 3,
    valueMax: 7,
};

const PREVIEW_TEXT =
    "Дает +{ValueOrRange2} к ценности случайной ячейке [color=#{ColorHex}]своего цвета[/color] при активации " +
    "[img width=32]res://roulette_interface/Icons_tags/ui_icon_activation.svg[/img].";

const DESCRIPTION_MODE_LABELS: Record<DescriptionMode, string> = {
    text: "Текст",
    "text-icons": "Текст + Включенные записи",
    "icons-emoji": "Все записи",
};

/**
 * Owns the actual form — all 4 fields are local state seeded once from `store.descriptionSettings`, so the
 * parent below forces a fresh mount (via `key`) exactly once the real Firestore value replaces the initial
 * DEFAULT_DESCRIPTION_SETTINGS placeholder (same pattern GlossaryPage uses for the same reason). Without this,
 * a fresh page load shows the hardcoded defaults until the very first Firestore snapshot arrives, and — worse —
 * never updates afterwards, since nothing here re-reads the store past the initial useState call. Touching any
 * other control after that (e.g. dragging a slider) would silently commit those stale defaults back over the
 * team's real shared settings.
 */
function SettingsForm() {
    const store = useStore();
    const [spriteWidthPx, setSpriteWidthPx] = useState(store.descriptionSettings.spriteWidthPx);
    const [fontSizePx, setFontSizePx] = useState(store.descriptionSettings.fontSizePx);
    const [descriptionMode, setDescriptionMode] = useState(store.descriptionSettings.descriptionMode);
    const [tooltipFontSizePx, setTooltipFontSizePx] = useState(store.descriptionSettings.tooltipFontSizePx);

    const commit = (next: {
        spriteWidthPx: number;
        fontSizePx: number;
        descriptionMode: DescriptionMode;
        tooltipFontSizePx: number;
    }) => {
        store.setDescriptionSettings(next);
    };

    const handleReset = () => {
        setSpriteWidthPx(DEFAULT_DESCRIPTION_SETTINGS.spriteWidthPx);
        setFontSizePx(DEFAULT_DESCRIPTION_SETTINGS.fontSizePx);
        setDescriptionMode(DEFAULT_DESCRIPTION_SETTINGS.descriptionMode);
        setTooltipFontSizePx(DEFAULT_DESCRIPTION_SETTINGS.tooltipFontSizePx);
        commit(DEFAULT_DESCRIPTION_SETTINGS);
    };

    return (
        <Stack spacing={3} sx={{ maxWidth: 700 }}>
            <Typography variant="h4">Настройки</Typography>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={3}>
                    <Typography variant="h6">Описания предметов</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Общие для всех — сохраняются сразу и применяются везде, где показывается описание предмета.
                    </Typography>

                    <TextField
                        select
                        label="Описание предметов"
                        value={descriptionMode}
                        onChange={(event) => {
                            const next = event.target.value as DescriptionMode;
                            setDescriptionMode(next);
                            commit({ spriteWidthPx, fontSizePx, descriptionMode: next, tooltipFontSizePx });
                        }}
                        size="small"
                        sx={{ maxWidth: 280 }}
                        helperText={
                            descriptionMode === "text"
                                ? "Как есть, из таблицы переводов — без [img]/[color]/{...} и без глоссария."
                                : descriptionMode === "text-icons"
                                  ? "[img]/[color=#...] и {...} становятся иконками/цветным текстом, плюс подключаются только включённые (галочка слева) записи глоссария."
                                  : "Как «Текст + Включенные записи», но подключаются вообще все записи глоссария — независимо от галочки."
                        }
                    >
                        {(Object.entries(DESCRIPTION_MODE_LABELS) as [DescriptionMode, string][]).map(
                            ([value, label]) => (
                                <MenuItem key={value} value={value}>
                                    {label}
                                </MenuItem>
                            )
                        )}
                    </TextField>

                    <Box>
                        <Typography gutterBottom>Размер спрайтов в описании: {spriteWidthPx}px</Typography>
                        <Slider
                            value={spriteWidthPx}
                            min={12}
                            max={96}
                            step={2}
                            onChange={(_event, value) => setSpriteWidthPx(value as number)}
                            onChangeCommitted={(_event, value) =>
                                commit({ spriteWidthPx: value as number, fontSizePx, descriptionMode, tooltipFontSizePx })
                            }
                            valueLabelDisplay="auto"
                            valueLabelFormat={(value) => `${value}px`}
                        />
                        <Typography variant="caption" color="text.secondary">
                            Ширина каждого значка в описании (в пикселях) — идёт напрямую в [img width=N], который
                            сайт сам генерирует для {"{item:ID}"}/{"{tag:Имя}"} и при экспорте в Google Sheets.
                        </Typography>
                    </Box>

                    <Box>
                        <Typography gutterBottom>Размер текста описания: {fontSizePx}px</Typography>
                        <Slider
                            value={fontSizePx}
                            min={10}
                            max={32}
                            step={1}
                            onChange={(_event, value) => setFontSizePx(value as number)}
                            onChangeCommitted={(_event, value) =>
                                commit({ spriteWidthPx, fontSizePx: value as number, descriptionMode, tooltipFontSizePx })
                            }
                            valueLabelDisplay="auto"
                        />
                    </Box>

                    <Box>
                        <Typography gutterBottom>Размер текста тултипов: {tooltipFontSizePx}px</Typography>
                        <Slider
                            value={tooltipFontSizePx}
                            min={8}
                            max={24}
                            step={1}
                            onChange={(_event, value) => setTooltipFontSizePx(value as number)}
                            onChangeCommitted={(_event, value) =>
                                commit({ spriteWidthPx, fontSizePx, descriptionMode, tooltipFontSizePx: value as number })
                            }
                            valueLabelDisplay="auto"
                        />
                        <Typography variant="caption" color="text.secondary">
                            Размер текста в тултипе с заметкой из глоссария (наведение на иконку/эмодзи в режимах
                            «Текст + Включенные записи» и «Все записи»).
                        </Typography>
                    </Box>

                    <Box>
                        <Button variant="outlined" onClick={handleReset}>
                            Сбросить к значениям по умолчанию
                        </Button>
                    </Box>
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Превью</Typography>
                    <Typography>
                        <ItemDescription
                            item={PREVIEW_ITEM}
                            description={PREVIEW_TEXT}
                            settingsOverride={{ spriteWidthPx, fontSizePx, descriptionMode, tooltipFontSizePx }}
                        />
                    </Typography>
                </Stack>
            </Paper>
        </Stack>
    );
}

export default function SettingsPage() {
    const store = useStore();
    return <SettingsForm key={store.sharedReady ? "ready" : "loading"} />;
}
