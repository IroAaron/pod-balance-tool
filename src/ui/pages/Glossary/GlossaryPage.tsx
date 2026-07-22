import { Fragment, useState } from "react";
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";
import { glossaryIconSrc } from "../../../core/domain/descriptionTemplate";
import type { GlossaryEntry } from "../../../core/models/GlossaryEntry";

function makeEmptyEntry(): GlossaryEntry {
    return { id: `glossary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, phrase: "" };
}

/**
 * The gap below a row — invisible until hovered, at which point a "+" appears centered in it to insert a new
 * entry right there. Driven by onMouseEnter/Leave state rather than a CSS `:hover` descendant selector — MUI's
 * own emitted rule for the button's baseline `opacity: 0` sx otherwise wins the cascade over a plain class-based
 * hover selector regardless of specificity (order-dependent, not worth fighting), so state is the reliable path.
 */
function InsertDivider({ onInsert }: { onInsert: () => void }) {
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

/** Reserved footprint for a preview (icon image or emoji glyph) next to its field — always occupies this much
 *  space, present or not, so a row with an icon/emoji set doesn't push its own fields wider than an otherwise
 *  identical row without one (see PREVIEW_SLOT_SX usage below — that mismatch was the actual cause of the
 *  "Фраза" field's width/position seeming to jump around between records). */
const PREVIEW_SLOT_SX = { width: 28, height: 28, flexShrink: 0 } as const;

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

    // Looks the id up in the real (unfiltered) list — the boundary a user hovers in a filtered/searched view
    // still needs to insert into that entry's actual neighboring position, not wherever it happens to sit
    // among just the filtered results.
    const handleInsertAfter = (afterId: string) => {
        setEntries((prev) => {
            const index = prev.findIndex((entry) => entry.id === afterId);
            const next = [...prev];
            next.splice(index + 1, 0, makeEmptyEntry());
            return next;
        });
    };

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

            <Stack>
                {filtered.map((entry) => (
                    <Fragment key={entry.id}>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "220px 230px 150px 1fr 40px",
                                    gap: 2,
                                    alignItems: "center",
                                }}
                            >
                                <TextField
                                    label="Фраза"
                                    value={entry.phrase}
                                    onChange={(event) => updateLocal(entry.id, { phrase: event.target.value })}
                                    onBlur={handleBlur}
                                    size="small"
                                    fullWidth
                                />

                                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                    <TextField
                                        label="Иконка (путь)"
                                        value={entry.icon ?? ""}
                                        onChange={(event) =>
                                            updateLocal(entry.id, { icon: event.target.value || undefined })
                                        }
                                        onBlur={handleBlur}
                                        size="small"
                                        placeholder="icons-tags/foo.svg"
                                        fullWidth
                                    />
                                    <IconPreview icon={entry.icon} />
                                </Stack>

                                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                    <TextField
                                        label="Эмодзи"
                                        value={entry.emoji ?? ""}
                                        onChange={(event) =>
                                            updateLocal(entry.id, { emoji: event.target.value || undefined })
                                        }
                                        onBlur={handleBlur}
                                        size="small"
                                        sx={{ width: 90 }}
                                    />
                                    <Box sx={PREVIEW_SLOT_SX}>
                                        {entry.emoji && <Typography sx={{ fontSize: 24 }}>{entry.emoji}</Typography>}
                                    </Box>
                                </Stack>

                                <TextField
                                    label="Заметка"
                                    value={entry.note ?? ""}
                                    onChange={(event) => updateLocal(entry.id, { note: event.target.value || undefined })}
                                    onBlur={handleBlur}
                                    size="small"
                                    placeholder="напр. MechAddItem / удалить"
                                    fullWidth
                                />

                                <IconButton aria-label="Удалить запись" onClick={() => handleDelete(entry.id)} size="small">
                                    <CloseIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        </Paper>
                        <InsertDivider onInsert={() => handleInsertAfter(entry.id)} />
                    </Fragment>
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
