import { Fragment, memo, useCallback, useState } from "react";
import { Box, Button, Checkbox, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";
import type { GlossaryEntry } from "../../../core/models/GlossaryEntry";
import { IconPathField, InsertDivider, PREVIEW_SLOT_SX } from "./shared";

function makeEmptyEntry(): GlossaryEntry {
    return { id: `glossary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, phrases: [] };
}

/** One phrase per line in the "Фразы" textarea — blank lines dropped, so trailing/stray newlines while typing
 *  don't turn into empty-string phrases that would match every position in every description. */
function parsePhrasesText(text: string): string[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

type RowProps = {
    entry: GlossaryEntry;
    onCommit: (id: string, fields: Omit<GlossaryEntry, "id">) => void;
    onDelete: (id: string) => void;
    onInsertAfter: (id: string) => void;
};

/**
 * One glossary entry's row — all 4 fields are local state, seeded from `entry` once and never re-synced from
 * props afterwards (React remounts this via the `key={entry.id}` in the list below if the id itself changes,
 * e.g. never in practice for an existing row). Typing therefore never touches the parent's `entries` array or
 * Firestore — only `onBlur` calls `onCommit`, which is the sole place that does. Wrapped in `memo` so that a
 * store-wide re-render (any Firestore snapshot elsewhere — builds, itemIcons, etc. all bump the same
 * `store.version` GlossaryPage subscribes to via useStore()) skips every row whose own `entry` prop reference is
 * unchanged, instead of reconciling hundreds of MUI TextFields on every unrelated update. This — not the
 * per-keystroke `setEntries` the previous version did — was the real cause of "the site lags on the glossary
 * page": a page with many rows, each a fairly deep MUI component tree, re-rendered in full on every keystroke
 * AND on every background sync tick from anywhere else in the app.
 */
const GlossaryRow = memo(function GlossaryRow({ entry, onCommit, onDelete, onInsertAfter }: RowProps) {
    const [phrasesText, setPhrasesText] = useState(entry.phrases.join("\n"));
    const [icon, setIcon] = useState(entry.icon ?? "");
    const [emoji, setEmoji] = useState(entry.emoji ?? "");
    const [note, setNote] = useState(entry.note ?? "");
    const [enabled, setEnabled] = useState(entry.enabled ?? true);

    // Omits (not just falsy-sets) icon/emoji/note when blank — an explicit `undefined` value on a plain object
    // key is a real, different thing from the key being absent, and Firestore's setDoc rejects the former (see
    // stripUndefined in firestoreStore.ts, kept as a second line of defense regardless of this one). Takes
    // explicit overrides since both the enabled checkbox and the icon picker commit immediately on their own
    // change/select (their handler runs before the corresponding setState's re-render lands), rather than
    // reading the not-yet-updated state variable.
    const buildFields = (enabledOverride: boolean, iconOverride: string): Omit<GlossaryEntry, "id"> => ({
        phrases: parsePhrasesText(phrasesText),
        ...(iconOverride ? { icon: iconOverride } : {}),
        ...(emoji ? { emoji } : {}),
        ...(note ? { note } : {}),
        enabled: enabledOverride,
    });

    const commit = () => onCommit(entry.id, buildFields(enabled, icon));

    const handleEnabledChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = event.target.checked;
        setEnabled(next);
        onCommit(entry.id, buildFields(next, icon));
    };

    const handleIconCommit = (nextIcon: string) => onCommit(entry.id, buildFields(enabled, nextIcon));

    return (
        <Fragment>
            <Paper variant="outlined" sx={{ p: 2 }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "40px 220px 230px 150px 1fr 40px",
                        gap: 2,
                        // "start" (not "center") since the phrases field can grow to several lines while the
                        // rest of the row's fields stay single-line — top-aligning avoids everything else
                        // drifting vertically to re-center against a taller neighbor.
                        alignItems: "start",
                    }}
                >
                    <Tooltip title="Запись подключается к описаниям предметов, когда включено">
                        <Checkbox
                            checked={enabled}
                            onChange={handleEnabledChange}
                            size="small"
                            sx={{ p: 0.5 }}
                            aria-label="Запись используется в описаниях"
                        />
                    </Tooltip>

                    <TextField
                        label="Фразы (по одной на строку)"
                        value={phrasesText}
                        onChange={(event) => setPhrasesText(event.target.value)}
                        onBlur={commit}
                        size="small"
                        multiline
                        minRows={1}
                        maxRows={6}
                        fullWidth
                    />

                    <IconPathField value={icon} onChange={setIcon} onCommit={handleIconCommit} />

                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <TextField
                            label="Эмодзи"
                            value={emoji}
                            onChange={(event) => setEmoji(event.target.value)}
                            onBlur={commit}
                            size="small"
                            sx={{ width: 90 }}
                        />
                        <Box sx={PREVIEW_SLOT_SX}>{emoji && <Typography sx={{ fontSize: 24 }}>{emoji}</Typography>}</Box>
                    </Stack>

                    <TextField
                        label="Заметка"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        onBlur={commit}
                        size="small"
                        placeholder="напр. MechAddItem / удалить"
                        fullWidth
                    />

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

    // All 4 callbacks below are useCallback'd with no dependency on `entries` (functional setState instead) so
    // their identity is stable across renders — required for GlossaryRow's `memo` to actually skip re-rendering
    // unrelated rows; a callback recreated every render would defeat memo regardless of how stable `entry` is.
    // Full replace of every field but `id`, not a merge — GlossaryRow's local state already covers every editable
    // field on its own row, so this is the one place a cleared field (icon/emoji/note) actually drops the key
    // instead of a stale value surviving a `{...entry, ...patch}` merge that never mentioned it.
    const handleRowCommit = useCallback(
        (id: string, fields: Omit<GlossaryEntry, "id">) => {
            setEntries((prev) => {
                const next = prev.map((entry) => (entry.id === id ? { id, ...fields } : entry));
                store.setGlossary(next);
                return next;
            });
        },
        [store]
    );

    const handleAdd = () => setEntries((prev) => [...prev, makeEmptyEntry()]);

    // Looks the id up in the real (unfiltered) list — the boundary a user hovers in a filtered/searched view
    // still needs to insert into that entry's actual neighboring position, not wherever it happens to sit
    // among just the filtered results.
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
                store.setGlossary(next);
                return next;
            });
        },
        [store]
    );

    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
        ? entries.filter(
              (entry) =>
                  entry.phrases.some((phrase) => phrase.toLowerCase().includes(normalizedQuery)) ||
                  (entry.note ?? "").toLowerCase().includes(normalizedQuery)
          )
        : entries;

    return (
        <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
                Фразы из описаний предметов, которые режимы «Текст + Включенные записи» и «Все записи» (Настройки →
                Описания предметов) заменяют на иконку или эмодзи — совпадение ищется по подстроке, без учёта
                регистра. Галочка слева включает/выключает запись для режима «Текст + Включенные записи» — в
                «Все записи» подключаются все записи независимо от галочки. Одна запись может содержать несколько
                фраз (по одной на строку) — любая из них ищется в тексте. Картинка — путь относительно public/
                (напр. «roulette_interface/icons-tags/ui_icon_activation.svg»), берётся из папок, которые
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
                    <GlossaryRow
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

/**
 * "Фраза → иконка/эмодзи" — see GlossaryEditor above for the actual editable list. This wrapper just forces a
 * fresh mount of the editor (via `key`) exactly once real Firestore data replaces the initial empty `[]`, so the
 * editor's local state starts from the real list instead of needing an effect to sync into it.
 */
export default function PhraseGlossaryTab() {
    const store = useStore();
    return <GlossaryEditor key={store.glossaryReady ? "ready" : "loading"} initialEntries={store.glossary} />;
}
