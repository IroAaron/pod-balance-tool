import { Fragment, memo, useCallback, useState } from "react";
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";
import type { TagIcon } from "../../../core/models/TagIcon";
import { IconPreview, InsertDivider } from "./shared";

function makeEmptyEntry(): TagIcon {
    return { id: `tag-icon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tag: "", icon: "" };
}

type RowProps = {
    entry: TagIcon;
    onCommit: (id: string, fields: Omit<TagIcon, "id">) => void;
    onDelete: (id: string) => void;
    onInsertAfter: (id: string) => void;
};

/** One tag→icon row — same local-state/commit-on-blur/memo shape as GlossaryRow (PhraseGlossaryTab.tsx), for the
 *  same reason: keeps typing in one row from re-rendering every other row on this page. */
const TagIconRow = memo(function TagIconRow({ entry, onCommit, onDelete, onInsertAfter }: RowProps) {
    const [tag, setTag] = useState(entry.tag);
    const [icon, setIcon] = useState(entry.icon);

    const commit = () => onCommit(entry.id, { tag, icon });

    return (
        <Fragment>
            <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: "grid", gridTemplateColumns: "260px 1fr 40px", gap: 2, alignItems: "center" }}>
                    <TextField
                        label="Тег"
                        value={tag}
                        onChange={(event) => setTag(event.target.value)}
                        onBlur={commit}
                        size="small"
                        placeholder="напр. Sport"
                        fullWidth
                    />

                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <TextField
                            label="Иконка (путь)"
                            value={icon}
                            onChange={(event) => setIcon(event.target.value)}
                            onBlur={commit}
                            size="small"
                            placeholder="roulette_interface/icons-tags/foo.svg"
                            fullWidth
                        />
                        <IconPreview icon={icon || undefined} />
                    </Stack>

                    <IconButton aria-label="Удалить запись" onClick={() => onDelete(entry.id)} size="small">
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Paper>
            <InsertDivider onInsert={() => onInsertAfter(entry.id)} />
        </Fragment>
    );
});

type EditorProps = {
    initialEntries: TagIcon[];
};

/** Same shape as PhraseGlossaryTab's GlossaryEditor — see its comment for why local state + key-forced remount. */
function TagIconsEditor({ initialEntries }: EditorProps) {
    const store = useStore();
    const [entries, setEntries] = useState<TagIcon[]>(initialEntries);
    const [query, setQuery] = useState("");

    const handleRowCommit = useCallback(
        (id: string, fields: Omit<TagIcon, "id">) => {
            setEntries((prev) => {
                const next = prev.map((entry) => (entry.id === id ? { id, ...fields } : entry));
                store.setTagIcons(next);
                return next;
            });
        },
        [store]
    );

    const handleAdd = () => setEntries((prev) => [...prev, makeEmptyEntry()]);

    const handleInsertAfter = useCallback((afterId: string) => {
        setEntries((prev) => {
            const index = prev.findIndex((entry) => entry.id === afterId);
            const next = [...prev];
            next.splice(index + 1, 0, makeEmptyEntry());
            return next;
        });
    }, []);

    const handleDelete = useCallback(
        (id: string) => {
            setEntries((prev) => {
                const next = prev.filter((entry) => entry.id !== id);
                store.setTagIcons(next);
                return next;
            });
        },
        [store]
    );

    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
        ? entries.filter((entry) => entry.tag.toLowerCase().includes(normalizedQuery))
        : entries;

    return (
        <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
                Иконка для тега — используется при вставке значка тега в описание предмета (кнопка «Вставить
                значок» в режиме редактирования описания). Картинка — путь относительно public/, как в основном
                глоссарии.
            </Typography>

            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <TextField
                    label="Поиск"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    size="small"
                    sx={{ minWidth: 220 }}
                />
                <Button variant="contained" onClick={handleAdd}>
                    + Добавить тег
                </Button>
            </Stack>

            {filtered.length === 0 && (
                <Typography color="text.secondary">
                    {entries.length === 0
                        ? "Список пока пуст. Добавьте тег и иконку для него."
                        : "Ничего не найдено по этому запросу."}
                </Typography>
            )}

            <Stack>
                {filtered.map((entry) => (
                    <TagIconRow
                        key={entry.id}
                        entry={entry}
                        onCommit={handleRowCommit}
                        onDelete={handleDelete}
                        onInsertAfter={handleInsertAfter}
                    />
                ))}
            </Stack>
        </Stack>
    );
}

/** Forces a fresh mount (via `key`) exactly once real Firestore data replaces the initial empty `[]` — same
 *  reasoning as PhraseGlossaryTab's default export. */
export default function TagIconsTab() {
    const store = useStore();
    return <TagIconsEditor key={store.tagIconsReady ? "ready" : "loading"} initialEntries={store.tagIcons} />;
}
