import { useState } from "react";
import { Box, Checkbox, Chip, ListItemText, MenuItem, Select, Tooltip, type SelectChangeEvent } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { useEnumRegistry } from "./EnumRegistryContext";
import { tooltipFontSizeSlotProps } from "./tooltipSlotProps";

interface Props {
    value: string[];
    onChange: (tags: string[]) => void;
}

export default function TagsSelect({ value, onChange }: Props) {
    const { values, descriptions, valueDescriptions } = useEnumRegistry();
    const options = values.ItemTag ?? [];
    const dimensionHint = descriptions.ItemTag;
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
                    "Теги"
                ) : (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {selected.map((tag) => (
                            <Chip key={tag} label={tag} size="small" />
                        ))}
                    </Box>
                )
            }
        >
            {options.map((tag) => {
                const desc = valueDescriptions.ItemTag?.[tag];
                return (
                    <Tooltip key={tag} title={desc || ""} placement="right" disableHoverListener={!desc} slotProps={slotProps}>
                        <MenuItem value={tag}>
                            <Checkbox size="small" checked={value.includes(tag)} />
                            <ListItemText primary={tag} />
                        </MenuItem>
                    </Tooltip>
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
