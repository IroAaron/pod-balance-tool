import { useState } from "react";
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";
import { glossaryIconSrc } from "../../../core/domain/descriptionTemplate";
import type { GlossaryEntry } from "../../../core/models/GlossaryEntry";

function makeEmptyEntry(): GlossaryEntry {
    return { id: `glossary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, phrase: "" };
}

/** Small live preview of a glossary entry's icon path — same resolution as the real description renderer
 *  (glossaryIconSrc), hidden on load error instead of showing a broken-image icon. Resets the "failed" flag
 *  when `icon` itself changes, via React's adjust-state-during-render idiom (not an effect) — comparing against
 *  the last-seen icon in state. */
function IconPreview({ icon }: { icon: string | undefined }) {
    const [failed, setFailed] = useState(false);
    const [trackedIcon, setTrackedIcon] = useState(icon);

    if (icon !== trackedIcon) {
        setTrackedIcon(icon);
        setFailed(false);
    }

    if (!icon || failed) return null;
    return (
        <Box
            component="img"
            src={glossaryIconSrc(icon)}
            alt=""
            sx={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }}
            onError={() => setFailed(true)}
        />
    );
}

type EditorProps = {
    initialEntries: GlossaryEntry[];
};

/**
 * Owns the actual editable list — kept in local state, pushed to the shared Firestore doc on blur / add / delete
 * (store.setGlossary always replaces the whole list, see GameStore). Split out from GlossaryPage so the parent
 * can force a fresh mount (and therefore a fresh `useState(initialEntries)`) exactly once real data arrives from
 * Firestore, via `key` — see GlossaryPage below. That avoids syncing local state from a prop in an effect, while
 * still meaning a concurrent edit from someone else won't clobber this page's in-progress fields afterwards
 * (same tradeoff BuildDetailPage's local name/icon/description fields already make).
 */
function GlossaryEditor({ initialEntries }: EditorProps) {
    const store = useStore();
    const [entries, setEntries] = useState<GlossaryEntry[]>(initialEntries);
    const [query, setQuery] = useState("");

    const commit = (next: GlossaryEntry[]) => {
        setEntries(next);
        store.setGlossary(next);
    };

    const updateLocal = (id: string, patch: Partial<GlossaryEntry>) => {
        setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    };

    const handleBlur = () => store.setGlossary(entries);

    const handleAdd = () => setEntries((prev) => [...prev, makeEmptyEntry()]);

    const handleDelete = (id: string) => commit(entries.filter((entry) => entry.id !== id));

    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
        ? entries.filter(
              (entry) =>
                  entry.phrase.toLowerCase().includes(normalizedQuery) ||
                  (entry.note ?? "").toLowerCase().includes(normalizedQuery)
          )
        : entries;

    return (
        <Stack spacing={3}>
            <Typography variant="h4">Глоссарий</Typography>
            <Typography variant="body2" color="text.secondary">
                Фразы из описаний предметов, которые режим «Иконки + Эмоджи» (Настройки → Описания предметов)
                заменяет на иконку или эмодзи — совпадение ищется по подстроке, без учёта регистра. Картинка — путь
                относительно public/ (напр. «icons-tags/ui_icon_activation.svg»), берётся из папок, которые
                синхронизируются с репозиторием игры. Если заданы и картинка, и эмодзи — показывается картинка.
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
                    + Добавить запись
                </Button>
            </Stack>

            {filtered.length === 0 && (
                <Typography color="text.secondary">
                    {entries.length === 0
                        ? "Глоссарий пока пуст. Добавьте запись — фразу из описания и иконку/эмодзи для неё."
                        : "Ничего не найдено по этому запросу."}
                </Typography>
            )}

            <Stack spacing={1.5}>
                {filtered.map((entry) => (
                    <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
                        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                            <TextField
                                label="Фраза"
                                value={entry.phrase}
                                onChange={(event) => updateLocal(entry.id, { phrase: event.target.value })}
                                onBlur={handleBlur}
                                size="small"
                                sx={{ minWidth: 220, flex: 1 }}
                            />

                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                <TextField
                                    label="Иконка (путь)"
                                    value={entry.icon ?? ""}
                                    onChange={(event) => updateLocal(entry.id, { icon: event.target.value || undefined })}
                                    onBlur={handleBlur}
                                    size="small"
                                    placeholder="icons-tags/foo.svg"
                                    sx={{ minWidth: 200 }}
                                />
                                <IconPreview icon={entry.icon} />
                            </Stack>

                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                <TextField
                                    label="Эмодзи"
                                    value={entry.emoji ?? ""}
                                    onChange={(event) => updateLocal(entry.id, { emoji: event.target.value || undefined })}
                                    onBlur={handleBlur}
                                    size="small"
                                    sx={{ width: 100 }}
                                />
                                {entry.emoji && <Typography sx={{ fontSize: 24 }}>{entry.emoji}</Typography>}
                            </Stack>

                            <TextField
                                label="Заметка"
                                value={entry.note ?? ""}
                                onChange={(event) => updateLocal(entry.id, { note: event.target.value || undefined })}
                                onBlur={handleBlur}
                                size="small"
                                placeholder="напр. MechAddItem / удалить"
                                sx={{ minWidth: 200, flex: 1 }}
                            />

                            <IconButton aria-label="Удалить запись" onClick={() => handleDelete(entry.id)} size="small">
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Paper>
                ))}
            </Stack>
        </Stack>
    );
}

/**
 * "Фраза → иконка/эмодзи" — see GlossaryEditor above for the actual editable list. This wrapper just forces a
 * fresh mount of the editor (via `key`) exactly once real Firestore data replaces the initial empty `[]`, so the
 * editor's local state starts from the real list instead of needing an effect to sync into it.
 */
export default function GlossaryPage() {
    const store = useStore();
    return <GlossaryEditor key={store.glossaryReady ? "ready" : "loading"} initialEntries={store.glossary} />;
}
