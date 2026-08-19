import { useState } from "react";
import { Autocomplete, Box, InputAdornment, TextField } from "@mui/material";
import { SPRITE_BASE_PATH } from "../../../core/domain/sprites";
import { useSpriteManifest } from "./useSpriteManifest";

const MINI_SUFFIX = "_mini.png";

interface Props {
    field: string;
    value: string;
    onChange: (value: string) => void;
}

/**
 * The two sprite columns hold the same sprite under two spellings: CardSpriteNameMini stores the real filename
 * (`card_track_rich_mini.png`), CardSpriteName stores it without the `_mini.png` ending (`card_track_rich`) —
 * which holds for 174 of the 177 real Cards. So one picker drives both, writing whichever spelling the column
 * wants, and turning the stored value back into a filename to preview it.
 */
export function isSpriteField(field: string): boolean {
    return field === "CardSpriteName" || field === "CardSpriteNameMini";
}

const storesFullFilename = (field: string) => field === "CardSpriteNameMini";

/** Stored value -> the file to show. Houses keep their own `_text.png` names, which simply won't resolve here. */
function previewFileName(field: string, value: string): string {
    if (!value) return "";
    if (storesFullFilename(field)) return value;
    return value.endsWith(".png") ? value : `${value}${MINI_SUFFIX}`;
}

function SpriteThumb({ file, size = 24 }: { file: string; size?: number }) {
    // Which file failed, rather than a plain "failed" flag: picking a different sprite has to clear the state,
    // and hiding the element imperatively in onError would leave it hidden forever once any value 404s.
    const [failedFile, setFailedFile] = useState<string | null>(null);

    if (!file || failedFile === file) return <Box sx={{ width: size, height: size, flexShrink: 0 }} />;

    return (
        <Box
            component="img"
            src={`${SPRITE_BASE_PATH}${encodeURIComponent(file)}`}
            alt=""
            sx={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }}
            // A value that isn't a real sprite (a House's _text.png, a typo) just shows nothing rather than a
            // broken-image icon — the field itself still holds whatever was typed.
            onError={() => setFailedFile(file)}
        />
    );
}

export default function SpriteSelect({ field, value, onChange }: Props) {
    const manifest = useSpriteManifest();

    // Options read in the same spelling the column stores, so the list matches what ends up in the cell.
    const options = storesFullFilename(field)
        ? manifest
        : manifest.map((file) => (file.endsWith(MINI_SUFFIX) ? file.slice(0, -MINI_SUFFIX.length) : file));

    return (
        <Autocomplete
            size="small"
            freeSolo
            options={options}
            value={value || null}
            onChange={(_event, picked) => onChange(picked ?? "")}
            // freeSolo: keeps values that aren't in the manifest (House sprites, anything hand-typed) editable.
            onInputChange={(_event, next, reason) => {
                if (reason === "input") onChange(next);
            }}
            renderOption={(props, option) => {
                const { key, ...optionProps } = props;
                return (
                    <Box
                        component="li"
                        key={key}
                        {...optionProps}
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                    >
                        <SpriteThumb file={previewFileName(field, option)} />
                        <span>{option}</span>
                    </Box>
                );
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={field}
                    // MUI v9 routes this through slotProps.input, not the old InputProps.
                    slotProps={{
                        ...params.slotProps,
                        input: {
                            ...params.slotProps?.input,
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SpriteThumb file={previewFileName(field, value)} size={28} />
                                </InputAdornment>
                            ),
                        },
                    }}
                />
            )}
        />
    );
}
