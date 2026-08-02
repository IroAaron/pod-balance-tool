import { memo, useState } from "react";
import {
    Autocomplete,
    Chip,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useStore } from "../../hooks/useStore";
import type { SprintRound } from "../../../core/models/Sprint";
import type { Round } from "../../../core/models/Round";

const MAX_ROUND_IDS = 9;

/** One numeric field wired to local-state-until-blur, same convention as BallDetailPage's own NumberField. */
function NumberField({
    label,
    value,
    onCommit,
    width = 130,
}: {
    label: string;
    value: number | undefined;
    onCommit: (value: number | undefined) => void;
    width?: number;
}) {
    const [text, setText] = useState(value?.toString() ?? "");
    return (
        <TextField
            label={label}
            type="number"
            size="small"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => onCommit(text.trim() === "" ? undefined : Number(text))}
            sx={{ width }}
        />
    );
}

/** A clearable pack picker over `store.packs` (rarely more than a few dozen real packs) — a plain `TextField
 *  select` instead of `Autocomplete`, since `Autocomplete` mounts real filtering/positioning machinery on every
 *  instance (`useAutocomplete`) even for a small fixed list with no need for free-text search; each SprintRoundCard
 *  used 3 of these, so across a whole stage board that mount/re-render cost added up to a real, reported lag both
 *  when first opening a sprint and while dragging (every dragover-triggered re-render recomputed all of them). */
function PackSelect({
    label,
    value,
    onCommit,
}: {
    label: string;
    value: string | undefined;
    onCommit: (value: string | undefined) => void;
}) {
    const store = useStore();
    return (
        <TextField
            select
            size="small"
            label={label}
            value={value ?? ""}
            onChange={(event) => onCommit(event.target.value || undefined)}
        >
            <MenuItem value="">
                <em>Нет</em>
            </MenuItem>
            {store.packs.map((pack) => (
                <MenuItem key={pack.id} value={pack.id}>
                    {pack.id}
                </MenuItem>
            ))}
        </TextField>
    );
}

type Props = {
    round: SprintRound;

    stageCount: number;

    onCommit: (id: string, patch: Partial<SprintRound>) => void;

    onDelete: (id: string) => void;

    onDragStart: (id: string) => void;

    onDragEnd: () => void;

    /** True for the one card currently being dragged. It stays fully mounted in its original spot (just dimmed
     *  and made non-interactive) rather than being removed from the DOM — removing the actual native drag-source
     *  element mid-drag breaks the browser's own drag-image tracking and can make `dragend`/`drop` stop firing
     *  reliably on it. It also doesn't get the `data-sprint-round-card` marker (see below) while dragging, so
     *  SprintDetailPage's position scan naturally skips it — it isn't really "in the list" positionally right now.
     */
    isDragging?: boolean;
};

/** One sprint-round entry — Quota/RewardTickerts/RewardTicketsPerBall (NumberField), RewardPack/HousesInShop/
 *  PackDeckStart (PackSelect, clearable, over store.packs), the roundIds pool (Chip list + add-Autocomplete over
 *  store.rounds, capped at 9 — same pattern as RoundDetailPage's deckBalls editor), and a "→ Этап" quick-move
 *  Select — the accessible/testable fallback for the stage board's native drag-and-drop (see SprintDetailPage).
 *  A round id CAN legitimately repeat within one entry's pool (confirmed in the real data — same "duplicates are
 *  real, never dedupe" precedent as Decks' repeated entries, here presumably weighting which round gets picked),
 *  so Chips are keyed/deleted by array index, not by id, and the add-Autocomplete never filters out ids already
 *  in the pool.
 *
 *  Note there's no `onDragOver` here at all — SprintDetailPage's ONE per-column handler measures this card's own
 *  `data-sprint-round-card` element position directly via `getBoundingClientRect()` rather than listening for
 *  events on each card individually (see that handler's own doc for why). */
const SprintRoundCard = memo(function SprintRoundCard({
    round,
    stageCount,
    onCommit,
    onDelete,
    onDragStart,
    onDragEnd,
    isDragging = false,
}: Props) {
    const store = useStore();

    const handleAddRound = (added: Round | null) => {
        if (!added) return;
        onCommit(round.id, { roundIds: [...round.roundIds, added.id] });
    };

    return (
        <Paper
            variant="outlined"
            draggable
            data-sprint-round-card={isDragging ? undefined : "true"}
            onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                onDragStart(round.id);
            }}
            onDragEnd={onDragEnd}
            sx={{
                p: 2,
                cursor: "grab",
                opacity: isDragging ? 0.4 : 1,
                pointerEvents: isDragging ? "none" : "auto",
            }}
        >
            <Stack spacing={1.5}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <DragIndicatorIcon fontSize="small" color="disabled" />
                    <Select
                        size="small"
                        value={round.stage ?? 1}
                        onChange={(event) => onCommit(round.id, { stage: Number(event.target.value) })}
                        sx={{ minWidth: 110 }}
                    >
                        {Array.from({ length: stageCount }, (_, index) => index + 1).map((stage) => (
                            <MenuItem key={stage} value={stage}>
                                → Этап {stage}
                            </MenuItem>
                        ))}
                    </Select>
                    <IconButton aria-label="Удалить раунд из забега" size="small" onClick={() => onDelete(round.id)}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Stack>

                <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
                    <NumberField label="Quota" value={round.quota} onCommit={(v) => onCommit(round.id, { quota: v })} />
                    <NumberField
                        label="RewardTickerts"
                        value={round.rewardTickets}
                        onCommit={(v) => onCommit(round.id, { rewardTickets: v })}
                    />
                    <NumberField
                        label="RewardTicketsPerBall"
                        value={round.rewardTicketsPerBall}
                        onCommit={(v) => onCommit(round.id, { rewardTicketsPerBall: v })}
                    />
                </Stack>

                <PackSelect
                    label="RewardPack (колода артефактов)"
                    value={round.rewardPackId}
                    onCommit={(v) => onCommit(round.id, { rewardPackId: v })}
                />

                <PackSelect
                    label="HousesInShop (домики в магазине)"
                    value={round.housesInShopPackId}
                    onCommit={(v) => onCommit(round.id, { housesInShopPackId: v })}
                />

                <PackSelect
                    label="PackDeckStart (колода стартового поля)"
                    value={round.packDeckStartId}
                    onCommit={(v) => onCommit(round.id, { packDeckStartId: v })}
                />

                <Typography variant="caption" color="text.secondary">
                    RoundSettings (список раундов)
                </Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {round.roundIds.map((roundId, roundIdIndex) => (
                        <Chip
                            key={`${roundId}-${roundIdIndex}`}
                            label={roundId}
                            size="small"
                            onDelete={() =>
                                onCommit(round.id, {
                                    roundIds: round.roundIds.filter((_id, i) => i !== roundIdIndex),
                                })
                            }
                        />
                    ))}
                    {round.roundIds.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                            Раундов пока нет.
                        </Typography>
                    )}
                </Stack>

                <Autocomplete
                    size="small"
                    disabled={round.roundIds.length >= MAX_ROUND_IDS}
                    options={store.rounds}
                    value={null}
                    getOptionLabel={(r: Round) => `${store.roundName(r)} (${r.id})`}
                    onChange={(_event, added) => handleAddRound(added)}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label={
                                round.roundIds.length >= MAX_ROUND_IDS
                                    ? "Достигнут предел (9)"
                                    : "+ Добавить раунд в список"
                            }
                        />
                    )}
                />
            </Stack>
        </Paper>
    );
});

export default SprintRoundCard;
