import { useEffect, useState } from "react";
import { Autocomplete, Box, IconButton, Stack, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { glossaryIconSrc, TAG_ICON_BASE_PATH, TAG_ICON_FIELDS_BASE_PATH } from "../../../core/domain/descriptionTemplate";

/** Reserved footprint for a preview (icon image or emoji glyph) next to its field — always occupies this much
 *  space, present or not, so a row with an icon/emoji set doesn't push its own fields wider than an otherwise
 *  identical row without one. Shared by both the phrase-glossary and tag-icons tabs. */
// eslint-disable-next-line react-refresh/only-export-components -- a plain sx constant, not a component
export const PREVIEW_SLOT_SX = { width: 28, height: 28, flexShrink: 0 } as const;

/** Small live preview of an icon path — same resolution as the real description renderer (glossaryIconSrc),
 *  hidden on load error instead of showing a broken-image icon. Resets the "failed" flag when `icon` itself
 *  changes, via React's adjust-state-during-render idiom (not an effect) — comparing against the last-seen icon. */
export function IconPreview({ icon }: { icon: string | undefined }) {
    const [failed, setFailed] = useState(false);
    const [trackedIcon, setTrackedIcon] = useState(icon);

    if (icon !== trackedIcon) {
        setTrackedIcon(icon);
        setFailed(false);
    }

    if (!icon || failed) return <Box sx={PREVIEW_SLOT_SX} />;
    return (
        <Box
            component="img"
            src={glossaryIconSrc(icon)}
            alt=""
            sx={{ ...PREVIEW_SLOT_SX, objectFit: "contain" }}
            onError={() => setFailed(true)}
        />
    );
}

type IconOption = { value: string; label: string; group: string };

// Insert path uses the game's real Godot folder casing (Icons_tags/Icons_tags_fields), not the site's own
// lowercase-hyphenated public/ convention — matches how every correctly-entered path in the real data already
// looks (see project memory), and is what reconstructResPath/glossaryIconSrc both normalize back from anyway.
const ICON_MANIFEST_SOURCES: Array<{ fetchBase: string; insertFolder: string; group: string }> = [
    { fetchBase: TAG_ICON_BASE_PATH, insertFolder: "roulette_interface/Icons_tags", group: "Icons_tags" },
    { fetchBase: TAG_ICON_FIELDS_BASE_PATH, insertFolder: "roulette_interface/Icons_tags_fields", group: "Icons_tags_fields" },
];

let iconOptionsPromise: Promise<IconOption[]> | null = null;

/** Fetches both icon manifests (public/roulette_interface/icons-tags(-fields)/manifest.json, written by
 *  scripts/generate-sprite-manifest.mjs on every sync/build) once and caches the combined list module-wide, so
 *  every row's IconPathPicker on the page shares one fetch instead of one per row. */
function loadIconOptions(): Promise<IconOption[]> {
    if (!iconOptionsPromise) {
        iconOptionsPromise = Promise.all(
            ICON_MANIFEST_SOURCES.map(async (source) => {
                try {
                    const response = await fetch(`${source.fetchBase}manifest.json`);
                    if (!response.ok) return [];
                    const files: string[] = await response.json();
                    return files.map((file) => ({ value: `${source.insertFolder}/${file}`, label: file, group: source.group }));
                } catch {
                    return [];
                }
            })
        ).then((lists) => lists.flat());
    }
    return iconOptionsPromise;
}

/**
 * Icon-path field with a searchable dropdown of every real icon file (from the synced Icons_tags/
 * Icons_tags_fields manifests) instead of hand-typing a path — picking an option fills the field with the
 * correct real-cased path automatically and commits immediately (a discrete pick, not a keystroke, same
 * reasoning as the enabled checkbox). Still `freeSolo`: typing a custom path (e.g. a file added to the game
 * repo before the manifest was regenerated) keeps working exactly as before, committed on blur as usual.
 */
export function IconPathField({
    value,
    onChange,
    onCommit,
}: {
    value: string;
    onChange: (value: string) => void;
    /** Takes the value being committed explicitly, rather than reading it back off state — picking an option
     *  calls onChange+onCommit synchronously in the same handler, before React applies the state update, so a
     *  commit that closed over stale state would commit the *previous* icon instead of the picked one. */
    onCommit: (nextValue: string) => void;
}) {
    const [options, setOptions] = useState<IconOption[]>([]);

    useEffect(() => {
        let cancelled = false;
        loadIconOptions().then((loaded) => {
            if (!cancelled) setOptions(loaded);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Autocomplete
                freeSolo
                size="small"
                fullWidth
                options={options}
                groupBy={(option) => (typeof option === "string" ? "" : option.group)}
                getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
                inputValue={value}
                // MUI also fires onInputChange (reason "reset") right after a selection, with the display text
                // (getOptionLabel — just the filename) rather than the full path onChange already committed —
                // only forward genuine typing ("input"), or a selected option's full path gets clobbered back
                // down to its bare filename immediately after being set.
                onInputChange={(_event, newValue, reason) => {
                    if (reason === "input" || reason === "clear") onChange(newValue);
                }}
                onChange={(_event, selected) => {
                    if (selected && typeof selected !== "string") {
                        onChange(selected.value);
                        onCommit(selected.value);
                    }
                }}
                onBlur={() => onCommit(value)}
                renderInput={(params) => (
                    <TextField {...params} label="Иконка (путь)" placeholder="roulette_interface/icons-tags/foo.svg" />
                )}
            />
            <IconPreview icon={value || undefined} />
        </Stack>
    );
}

/**
 * The gap below a row — invisible until hovered, at which point a "+" appears centered in it to insert a new
 * entry right there. Driven by onMouseEnter/Leave state rather than a CSS `:hover` descendant selector — MUI's
 * own emitted rule for the button's baseline `opacity: 0` sx otherwise wins the cascade over a plain class-based
 * hover selector regardless of specificity (order-dependent, not worth fighting), so state is the reliable path.
 */
export function InsertDivider({ onInsert }: { onInsert: () => void }) {
    const [hovered, setHovered] = useState(false);

    return (
        <Box
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            sx={{ position: "relative", height: 20 }}
        >
            <IconButton
                aria-label="Добавить запись здесь"
                onClick={onInsert}
                size="small"
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    opacity: hovered ? 1 : 0,
                    transition: "opacity 0.15s",
                    bgcolor: "background.paper",
                    border: "1px solid",
                    borderColor: "divider",
                    "&:hover": { bgcolor: "action.hover" },
                }}
            >
                <AddIcon fontSize="small" />
            </IconButton>
        </Box>
    );
}
