import { Autocomplete, Box, TextField } from "@mui/material";
import ItemOptionIcon from "./ItemOptionIcon";
import { useItemRegistry, type ItemOption } from "./ItemRegistryContext";

interface Props {
    field: string;
    value: string;
    onChange: (value: string) => void;
}

const GROUP_LABELS = { real: "Предметы", canvas: "Новые на холсте" };

/** Searchable picker over real Предметы plus Item nodes drafted on this canvas — matches by name or id. */
export default function ItemRefSelect({ field, value, onChange }: Props) {
    const items = useItemRegistry();
    const selected = items.find((i) => i.id === value) ?? null;

    return (
        <Autocomplete
            size="small"
            options={items}
            groupBy={(opt) => GROUP_LABELS[opt.source]}
            value={selected}
            getOptionLabel={(opt) => `${opt.name || "(без имени)"} (${opt.id})`}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            onChange={(_e, newValue) => onChange(newValue?.id ?? "")}
            renderInput={(params) => <TextField {...params} label={field} />}
            renderOption={(props, option: ItemOption) => {
                const { key, ...optionProps } = props;
                return (
                    <Box component="li" key={key} {...optionProps} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <ItemOptionIcon option={option} />
                        <span>
                            {option.name || "(без имени)"} ({option.id})
                        </span>
                    </Box>
                );
            }}
            noOptionsText="Нет подходящих предметов"
        />
    );
}
