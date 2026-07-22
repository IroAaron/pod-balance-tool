import { useState } from "react";
import { Autocomplete, Box, Button, Popover, Stack, Tab, Tabs, TextField } from "@mui/material";
import { useStore } from "../hooks/useStore";
import ItemIcon from "./ItemIcon";
import type { Item } from "../../core/models/Item";
import type { TagIcon } from "../../core/models/TagIcon";

type Props = {
    /** Called with the literal `{item:ID}`/`{tag:Name}` token to splice into the description at the cursor. */
    onInsert: (token: string) => void;
};

type TabKey = "item" | "tag";

/**
 * "Вставить значок" — lets a description editor reference an item's own icon or a curated tag icon (GlossaryPage's
 * "Иконки тегов" tab) without typing a real res://.../file.png path by hand. Inserts a lightweight `{item:ID}`/
 * `{tag:Name}` token (see descriptionTemplate.ts's applyIconTokens) that renders as the real icon everywhere a
 * description is shown, and — once the Sheets export pipeline exists — gets converted into real [img] BBCode
 * at export time. Item search reuses the real Items list directly; there's no separate curated data for it.
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
                    </Tabs>

                    {tab === "item" ? (
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
                    ) : (
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
                </Box>
            </Popover>
        </>
    );
}
