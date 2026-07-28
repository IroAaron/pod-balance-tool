import { Autocomplete, TextField } from "@mui/material";
import { useItemRegistry } from "./ItemRegistryContext";

interface Props {
    field: string;
    value: string;
    onChange: (value: string) => void;
}

/** Searchable picker over the Item nodes currently on the canvas — matches by name or id. */
export default function ItemRefSelect({ field, value, onChange }: Props) {
    const items = useItemRegistry();
    const selected = items.find((i) => i.id === value) ?? null;

    return (
        <Autocomplete
            size="small"
            options={items}
            value={selected}
            getOptionLabel={(opt) => `${opt.name || "(без имени)"} (${opt.id})`}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            onChange={(_e, newValue) => onChange(newValue?.id ?? "")}
            renderInput={(params) => <TextField {...params} label={field} />}
            noOptionsText="Нет предметов на холсте"
        />
    );
}
