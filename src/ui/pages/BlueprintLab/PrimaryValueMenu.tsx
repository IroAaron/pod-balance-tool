import { useState } from "react";
import { Autocomplete, Box, Button, ClickAwayListener, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { FIELD_TO_DIMENSION } from "./enumData";
import { useEnumRegistry } from "./EnumRegistryContext";
import { tooltipFontSizeSlotProps } from "./tooltipSlotProps";

interface Props {
    x: number;
    y: number;
    fieldLabel: string;
    onConfirm: (value: string) => void;
    onClose: () => void;
}

export default function PrimaryValueMenu({ x, y, fieldLabel, onConfirm, onClose }: Props) {
    const [value, setValue] = useState<string | null>(null);
    const { values, descriptions, valueDescriptions } = useEnumRegistry();
    const dimension = FIELD_TO_DIMENSION[fieldLabel];
    const options = dimension ? values[dimension] ?? [] : [];
    const dimensionHint = dimension ? descriptions[dimension] : undefined;
    const store = useStore();
    const slotProps = tooltipFontSizeSlotProps(store.descriptionSettings.tooltipFontSizePx);

    const confirm = (picked?: string | null) => {
        const v = (picked ?? value ?? "").trim();
        if (v) onConfirm(v);
    };

    return (
        <ClickAwayListener onClickAway={onClose}>
            <Paper elevation={6} sx={{ position: "absolute", left: x, top: y, zIndex: 20, width: 260, p: 1.5 }}>
                <Stack spacing={1}>
                    <Typography variant="caption" color="text.secondary">
                        {fieldLabel}
                        {dimension ? ` (${dimension})` : ""}
                        {dimensionHint ? ` — ${dimensionHint}` : ""}
                    </Typography>
                    <Autocomplete
                        options={options}
                        value={value}
                        openOnFocus
                        onChange={(_e, newValue) => {
                            setValue(newValue);
                            if (newValue) confirm(newValue);
                        }}
                        renderInput={(params) => <TextField {...params} size="small" autoFocus label={fieldLabel} />}
                        renderOption={(props, option) => {
                            const { key, ...optionProps } = props;
                            const desc = dimension ? valueDescriptions[dimension]?.[option] : undefined;
                            return (
                                <Tooltip key={key} title={desc || ""} placement="right" disableHoverListener={!desc} slotProps={slotProps}>
                                    <Box component="li" {...optionProps}>
                                        {option}
                                    </Box>
                                </Tooltip>
                            );
                        }}
                    />
                    <Button size="small" variant="contained" onClick={() => confirm()} disabled={!value}>
                        Создать
                    </Button>
                </Stack>
            </Paper>
        </ClickAwayListener>
    );
}
