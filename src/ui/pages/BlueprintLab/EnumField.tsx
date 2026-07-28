import { useState } from "react";
import { Autocomplete, Box, TextField, Tooltip } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { FIELD_TO_DIMENSION } from "./enumData";
import { useEnumRegistry } from "./EnumRegistryContext";
import { tooltipFontSizeSlotProps } from "./tooltipSlotProps";

interface Props {
    field: string;
    value: string;
    onChange: (value: string) => void;
}

/** Renders a field as a closed dropdown over its mapped Enum dimension, or a plain text input if it has none. */
export default function EnumField({ field, value, onChange }: Props) {
    const dimension = FIELD_TO_DIMENSION[field];
    const { values, descriptions, valueDescriptions } = useEnumRegistry();
    const store = useStore();
    const slotProps = tooltipFontSizeSlotProps(store.descriptionSettings.tooltipFontSizePx);
    const [listOpen, setListOpen] = useState(false);

    if (!dimension) {
        return <TextField size="small" label={field} value={value} onChange={(e) => onChange(e.target.value)} />;
    }

    const control = (
        <Autocomplete
            size="small"
            options={values[dimension] ?? []}
            value={value || null}
            onOpen={() => setListOpen(true)}
            onClose={() => setListOpen(false)}
            onChange={(_e, newValue) => onChange(newValue ?? "")}
            renderInput={(params) => <TextField {...params} label={field} />}
            renderOption={(props, option) => {
                const { key, ...optionProps } = props;
                const desc = valueDescriptions[dimension]?.[option];
                return (
                    <Tooltip key={key} title={desc || ""} placement="right" disableHoverListener={!desc} slotProps={slotProps}>
                        <Box component="li" {...optionProps}>
                            {option}
                        </Box>
                    </Tooltip>
                );
            }}
        />
    );

    const dimensionHint = descriptions[dimension];
    if (!dimensionHint) return control;

    return (
        <Tooltip title={dimensionHint} placement="top" arrow slotProps={slotProps} disableHoverListener={listOpen}>
            <Box>{control}</Box>
        </Tooltip>
    );
}
