import { useState } from "react";
import { Box, Checkbox, Chip, ListItemText, MenuItem, Select, Tooltip, type SelectChangeEvent } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { useEnumRegistry } from "./EnumRegistryContext";
import { tooltipFontSizeSlotProps } from "./tooltipSlotProps";

interface Props {
    dimension: string;
    label: string;
    value: string[];
    onChange: (values: string[]) => void;
}

/** Multi-select over an Enum dimension — used for both the item's Tags (ItemTag) and PossibleColors (TargetColor). */
export default function EnumMultiSelect({ dimension, label, value, onChange }: Props) {
    const { values, descriptions, valueDescriptions } = useEnumRegistry();
    const options = values[dimension] ?? [];
    const dimensionHint = descriptions[dimension];
    const store = useStore();
    const slotProps = tooltipFontSizeSlotProps(store.descriptionSettings.tooltipFontSizePx);
    const [listOpen, setListOpen] = useState(false);
    const [controlHovered, setControlHovered] = useState(false);

    const handleChange = (e: SelectChangeEvent<string[]>) => {
        const next = e.target.value;
        onChange(typeof next === "string" ? next.split(",") : next);
    };

    const select = (
        <Select
            size="small"
            multiple
            displayEmpty
            value={value}
            onChange={handleChange}
            onOpen={() => setListOpen(true)}
            onClose={() => setListOpen(false)}
            renderValue={(selected) =>
                selected.length === 0 ? (
                    label
                ) : (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {selected.map((v) => (
                            <Chip key={v} label={v} size="small" />
                        ))}
                    </Box>
                )
            }
        >
            {options.map((v) => {
                const desc = valueDescriptions[dimension]?.[v];
                // MenuItem must stay Select's *direct* child: Select reads `child.props.value` to know which
                // option was clicked, so wrapping it in a Tooltip made every click resolve to `undefined` and
                // silently select nothing. The tooltip goes inside the item instead, around the whole row.
                return (
                    <MenuItem key={v} value={v}>
                        <Tooltip title={desc || ""} placement="right" disableHoverListener={!desc} slotProps={slotProps}>
                            <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                                <Checkbox size="small" checked={value.includes(v)} />
                                <ListItemText primary={v} />
                            </Box>
                        </Tooltip>
                    </MenuItem>
                );
            })}
        </Select>
    );

    if (!dimensionHint) return select;

    return (
        <Tooltip
            title={dimensionHint}
            placement="top"
            arrow
            slotProps={slotProps}
            open={controlHovered && !listOpen}
            onOpen={() => setControlHovered(true)}
            onClose={() => setControlHovered(false)}
        >
            <Box>{select}</Box>
        </Tooltip>
    );
}
