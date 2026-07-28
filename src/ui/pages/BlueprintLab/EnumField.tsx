import { Autocomplete, TextField } from "@mui/material";
import { FIELD_TO_DIMENSION } from "./enumData";
import { useEnumRegistry } from "./EnumRegistryContext";

interface Props {
    field: string;
    value: string;
    onChange: (value: string) => void;
}

/** Renders a field as a closed dropdown over its mapped Enum dimension, or a plain text input if it has none. */
export default function EnumField({ field, value, onChange }: Props) {
    const dimension = FIELD_TO_DIMENSION[field];
    const { values } = useEnumRegistry();

    if (!dimension) {
        return <TextField size="small" label={field} value={value} onChange={(e) => onChange(e.target.value)} />;
    }

    return (
        <Autocomplete
            size="small"
            options={values[dimension] ?? []}
            value={value || null}
            onChange={(_e, newValue) => onChange(newValue ?? "")}
            renderInput={(params) => <TextField {...params} label={field} />}
        />
    );
}
