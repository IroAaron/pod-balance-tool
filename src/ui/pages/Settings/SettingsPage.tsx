import { useState } from "react";
import { Box, Button, Paper, Slider, Stack, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemDescription from "../../components/ItemDescription";
import { DEFAULT_DESCRIPTION_SETTINGS } from "../../../core/domain/descriptionTemplate";
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

export default function SettingsPage() {
    const store = useStore();
    const [spriteScale, setSpriteScale] = useState(store.descriptionSettings.spriteScale);
    const [fontSizePx, setFontSizePx] = useState(store.descriptionSettings.fontSizePx);

    const commit = (next: { spriteScale: number; fontSizePx: number }) => {
        store.setDescriptionSettings(next);
    };

    const handleReset = () => {
        setSpriteScale(DEFAULT_DESCRIPTION_SETTINGS.spriteScale);
        setFontSizePx(DEFAULT_DESCRIPTION_SETTINGS.fontSizePx);
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

                    <Box>
                        <Typography gutterBottom>Размер спрайтов в описании: {Math.round(spriteScale * 100)}%</Typography>
                        <Slider
                            value={spriteScale}
                            min={0.25}
                            max={3}
                            step={0.05}
                            onChange={(_event, value) => setSpriteScale(value as number)}
                            onChangeCommitted={(_event, value) => commit({ spriteScale: value as number, fontSizePx })}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
                        />
                        <Typography variant="caption" color="text.secondary">
                            Множитель к ширине из [img width=N] в самом тексте описания — 100% значит «как задано в
                            игре».
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
                            onChangeCommitted={(_event, value) => commit({ spriteScale, fontSizePx: value as number })}
                            valueLabelDisplay="auto"
                        />
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
                            settingsOverride={{ spriteScale, fontSizePx }}
                        />
                    </Typography>
                </Stack>
            </Paper>
        </Stack>
    );
}
