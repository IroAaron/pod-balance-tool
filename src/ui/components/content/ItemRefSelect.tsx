import { Autocomplete, Box, TextField } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../ItemIcon";
import type { Item } from "../../../core/models/Item";

interface Props {
    field: string;
    value: string;
    onChange: (value: string) => void;
}

/** Searchable picker over the loaded Предметы — matches on name or id, since ids are what the tables store. */
export default function ItemRefSelect({ field, value, onChange }: Props) {
    const store = useStore();
    const items = store.items;
    const selected = items.find((item) => item.id === value) ?? null;

    return (
        <Autocomplete
            size="small"
            options={items}
            value={selected}
            getOptionLabel={(item) => `${store.itemName(item)} (${item.id})`}
            isOptionEqualToValue={(option, val) => option.id === val.id}
            onChange={(_e, newValue) => onChange(newValue?.id ?? "")}
            renderInput={(params) => <TextField {...params} label={field} />}
            renderOption={(props, item: Item) => {
                const { key, ...optionProps } = props;
                return (
                    <Box component="li" key={key} {...optionProps} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <ItemIcon item={item} size={24} />
                        <span>
                            {store.itemName(item)} ({item.id})
                        </span>
                    </Box>
                );
            }}
            noOptionsText="Нет подходящих предметов"
        />
    );
}
