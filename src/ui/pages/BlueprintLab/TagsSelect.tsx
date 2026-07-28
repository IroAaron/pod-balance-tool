import { Box, Checkbox, Chip, ListItemText, MenuItem, Select, type SelectChangeEvent } from "@mui/material";
import { useEnumRegistry } from "./EnumRegistryContext";

interface Props {
    value: string[];
    onChange: (tags: string[]) => void;
}

export default function TagsSelect({ value, onChange }: Props) {
    const { values } = useEnumRegistry();
    const options = values.ItemTag ?? [];

    const handleChange = (e: SelectChangeEvent<string[]>) => {
        const next = e.target.value;
        onChange(typeof next === "string" ? next.split(",") : next);
    };

    return (
        <Select
            size="small"
            multiple
            displayEmpty
            value={value}
            onChange={handleChange}
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
            {options.map((tag) => (
                <MenuItem key={tag} value={tag}>
                    <Checkbox size="small" checked={value.includes(tag)} />
                    <ListItemText primary={tag} />
                </MenuItem>
            ))}
        </Select>
    );
}
