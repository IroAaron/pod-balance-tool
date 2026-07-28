import { useMemo, useState } from "react";
import { Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";

interface DeckGroup {
    deckId: string;

    entries: { itemId: string; weight?: number }[];
}

/** Read-only, grouped-by-deck view of every imported DecksShop row — see domain/shopProbability.ts for how weight
 *  feeds the auto-computed shop-appearance probability shown on the Balance page. */
export default function DecksTab() {
    const store = useStore();
    const [query, setQuery] = useState("");

    const groups = useMemo<DeckGroup[]>(() => {
        const byDeck = new Map<string, { itemId: string; weight?: number }[]>();
        for (const entry of store.shopDecks) {
            const list = byDeck.get(entry.deckId);
            if (list) list.push({ itemId: entry.itemId, weight: entry.weight });
            else byDeck.set(entry.deckId, [{ itemId: entry.itemId, weight: entry.weight }]);
        }
        return [...byDeck.entries()]
            .map(([deckId, entries]) => ({ deckId, entries }))
            .sort((a, b) => a.deckId.localeCompare(b.deckId));
    }, [store.shopDecks]);

    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return groups;
        return groups
            .map((group) => ({
                ...group,
                entries: group.deckId.toLowerCase().includes(normalized)
                    ? group.entries
                    : group.entries.filter((entry) => {
                          const item = store.getItem(entry.itemId);
                          const name = item ? store.itemName(item) : "";
                          return entry.itemId.toLowerCase().includes(normalized) || name.toLowerCase().includes(normalized);
                      }),
            }))
            .filter((group) => group.entries.length > 0);
        // itemName reads live translations at call time; store.getItem is a stable store method.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, query, store.translations]);

    return (
        <Stack spacing={2}>
            <TextField
                label="Поиск по DeckId / предмету"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                size="small"
                sx={{ maxWidth: 320 }}
            />

            <Typography variant="body2" color="text.secondary">
                Колод: {filtered.length} из {groups.length}
            </Typography>

            <Stack spacing={2}>
                {filtered.map((group) => (
                    <Paper key={group.deckId} variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            {group.deckId}
                        </Typography>
                        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                            {group.entries.map((entry, index) => {
                                const item = store.getItem(entry.itemId);
                                const label = `${item ? store.itemName(item) : entry.itemId}${
                                    entry.weight !== undefined ? ` (вес ${entry.weight})` : ""
                                }`;
                                return (
                                    <Chip
                                        key={`${entry.itemId}-${index}`}
                                        icon={item ? <ItemIcon item={item} size={20} /> : undefined}
                                        label={label}
                                        variant="outlined"
                                        sx={{ height: "auto", py: 0.5, "& .MuiChip-label": { whiteSpace: "normal" } }}
                                    />
                                );
                            })}
                        </Stack>
                    </Paper>
                ))}
            </Stack>

            {store.shopDecks.length === 0 && (
                <Typography color="text.secondary">
                    Колод пока нет — загрузите таблицу DecksShop на странице «Источники».
                </Typography>
            )}
        </Stack>
    );
}
