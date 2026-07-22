import { useState } from "react";
import { Autocomplete, Box, Button, Popover, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useStore } from "../hooks/useStore";
import ItemIcon from "./ItemIcon";
import { glossaryIconSrc } from "../../core/domain/descriptionTemplate";
import type { Item } from "../../core/models/Item";
import type { TagIcon } from "../../core/models/TagIcon";
import type { GlossaryEntry } from "../../core/models/GlossaryEntry";

type Props = {
    /** Called with the literal `{item:ID}`/`{tag:Name}`/`{glossary:ID}` token to splice into the description at
     *  the cursor. */
    onInsert: (token: string) => void;
};

type TabKey = "item" | "tag" | "glossary";

const GLOSSARY_PREVIEW_SX = { width: 20, height: 20, flexShrink: 0 } as const;

/** Small icon/emoji preview for a glossary entry option — same resolution as the real description renderer. */
function GlossaryOptionPreview({ entry }: { entry: GlossaryEntry }) {
    if (entry.icon) {
        return <Box component="img" src={glossaryIconSrc(entry.icon)} alt="" sx={{ ...GLOSSARY_PREVIEW_SX, objectFit: "contain" }} />;
    }
    if (entry.emoji) {
        return <Typography sx={{ ...GLOSSARY_PREVIEW_SX, fontSize: 16, lineHeight: "20px", textAlign: "center" }}>{entry.emoji}</Typography>;
    }
    return <Box sx={GLOSSARY_PREVIEW_SX} />;
}

/**
 * "Вставить значок" — lets a description editor reference an item's own icon, a curated tag icon (GlossaryPage's
 * "Иконки тегов" tab), or a specific glossary entry's icon/emoji (GlossaryPage's "Значки" tab, inserted directly
 * rather than relying on its phrase appearing verbatim in the text) without typing a real res://.../file.png path
 * by hand. Inserts a lightweight `{item:ID}`/`{tag:Name}`/`{glossary:ID}` token (see descriptionTemplate.ts's
 * applyIconTokens) that renders as the real icon everywhere a description is shown, and converts into real [img]
 * BBCode at Sheets-export time. Item search reuses the real Items list directly; there's no separate curated
 * data for it.
 */
export default function IconTokenInsertButton({ onInsert }: Props) {
    const store = useStore();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [tab, setTab] = useState<TabKey>("item");

    const handleClose = () => setAnchorEl(null);

    const handleInsertItem = (item: Item | null) => {
        if (!item) return;
        onInsert(`{item:${item.id}}`);
        handleClose();
    };

    const handleInsertTag = (entry: TagIcon | null) => {
        if (!entry) return;
        onInsert(`{tag:${entry.tag}}`);
        handleClose();
    };

    const handleInsertGlossary = (entry: GlossaryEntry | null) => {
        if (!entry) return;
        onInsert(`{glossary:${entry.id}}`);
        handleClose();
    };

    return (
        <>
            <Button size="small" onClick={(event) => setAnchorEl(event.currentTarget)}>
                Вставить значок
            </Button>

            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            >
                <Box sx={{ p: 2, width: 360 }}>
                    <Tabs value={tab} onChange={(_event, next: TabKey) => setTab(next)} sx={{ mb: 2 }}>
                        <Tab value="item" label="Предмет" />
                        <Tab value="tag" label="Тег" />
                        <Tab value="glossary" label="Значки" />
                    </Tabs>

                    {tab === "item" && (
                        <Autocomplete
                            options={store.items}
                            getOptionLabel={(item) => `${store.itemName(item)} (${item.id})`}
                            renderOption={(props, item) => (
                                <Stack component="li" {...props} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                    <ItemIcon item={item} size={24} />
                                    <span>
                                        {store.itemName(item)} ({item.id})
                                    </span>
                                </Stack>
                            )}
                            onChange={(_event, item) => handleInsertItem(item)}
                            renderInput={(params) => <TextField {...params} label="Найти предмет" size="small" autoFocus />}
                            value={null}
                            blurOnSelect
                        />
                    )}

                    {tab === "tag" && (
                        <Autocomplete
                            options={store.tagIcons}
                            getOptionLabel={(entry) => entry.tag}
                            onChange={(_event, entry) => handleInsertTag(entry)}
                            renderInput={(params) => <TextField {...params} label="Найти тег" size="small" autoFocus />}
                            value={null}
                            blurOnSelect
                            noOptionsText="Нет тегов — добавьте на странице «Глоссарий» → «Иконки тегов»"
                        />
                    )}

                    {tab === "glossary" && (
                        <Autocomplete
                            // Only entries with an actual icon/emoji — a bare entry would just insert a token
                            // that renders as literal unresolved text, same "usable" filter applyGlossary uses.
                            options={store.glossary.filter((entry) => entry.icon || entry.emoji)}
                            getOptionLabel={(entry) => entry.phrases.join(" / ") || "(без фразы)"}
                            renderOption={(props, entry) => (
                                <Stack component="li" {...props} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                    <GlossaryOptionPreview entry={entry} />
                                    <span>{entry.phrases.join(" / ") || "(без фразы)"}</span>
                                </Stack>
                            )}
                            onChange={(_event, entry) => handleInsertGlossary(entry)}
                            renderInput={(params) => <TextField {...params} label="Найти запись глоссария" size="small" autoFocus />}
                            value={null}
                            blurOnSelect
                            noOptionsText="Глоссарий пуст — добавьте на странице «Глоссарий»"
                        />
                    )}
                </Box>
            </Popover>
        </>
    );
}
