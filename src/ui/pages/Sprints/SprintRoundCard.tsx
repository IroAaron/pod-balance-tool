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
import type { Pack } from "../../../core/models/Pack";
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

type Props = {
    round: SprintRound;

    stageCount: number;

    onCommit: (id: string, patch: Partial<SprintRound>) => void;

    onDelete: (id: string) => void;

    onDragStart: (id: string) => void;
};

/** One sprint-round entry — Quota/RewardTickerts/RewardTicketsPerBall (NumberField), RewardPack/HousesInShop/
 *  PackDeckStart (clearable Autocomplete over store.packs), the roundIds pool (Chip list + add-Autocomplete over
 *  store.rounds, capped at 9 — same pattern as RoundDetailPage's deckBalls editor), and a "→ Этап" quick-move
 *  Select — the accessible/testable fallback for the stage board's native drag-and-drop (see SprintDetailPage).
 *  A round id CAN legitimately repeat within one entry's pool (confirmed in the real data — same "duplicates are
 *  real, never dedupe" precedent as Decks' repeated entries, here presumably weighting which round gets picked),
 *  so Chips are keyed/deleted by array index, not by id, and the add-Autocomplete never filters out ids already
 *  in the pool. */
const SprintRoundCard = memo(function SprintRoundCard({ round, stageCount, onCommit, onDelete, onDragStart }: Props) {
    const store = useStore();

    const rewardPack = round.rewardPackId ? store.getPack(round.rewardPackId) : null;
    const housesInShopPack = round.housesInShopPackId ? store.getPack(round.housesInShopPackId) : null;
    const packDeckStartPack = round.packDeckStartId ? store.getPack(round.packDeckStartId) : null;

    const handleAddRound = (added: Round | null) => {
        if (!added) return;
        onCommit(round.id, { roundIds: [...round.roundIds, added.id] });
    };

    return (
        <Paper
            variant="outlined"
            draggable
            onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                onDragStart(round.id);
            }}
            sx={{ p: 2, cursor: "grab" }}
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

                <Autocomplete
                    size="small"
                    options={store.packs}
                    value={rewardPack}
                    getOptionLabel={(pack: Pack) => pack.id}
                    onChange={(_event, pack) => onCommit(round.id, { rewardPackId: pack?.id ?? undefined })}
                    renderInput={(params) => <TextField {...params} label="RewardPack (колода артефактов)" />}
                />

                <Autocomplete
                    size="small"
                    options={store.packs}
                    value={housesInShopPack}
                    getOptionLabel={(pack: Pack) => pack.id}
                    onChange={(_event, pack) => onCommit(round.id, { housesInShopPackId: pack?.id ?? undefined })}
                    renderInput={(params) => <TextField {...params} label="HousesInShop (домики в магазине)" />}
                />

                <Autocomplete
                    size="small"
                    options={store.packs}
                    value={packDeckStartPack}
                    getOptionLabel={(pack: Pack) => pack.id}
                    onChange={(_event, pack) => onCommit(round.id, { packDeckStartId: pack?.id ?? undefined })}
                    renderInput={(params) => <TextField {...params} label="PackDeckStart (колода стартового поля)" />}
                />

                <Typography variant="caption" color="text.secondary">
                    RoundSettings (список раундов)
                </Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {round.roundIds.map((roundId, index) => (
                        <Chip
                            key={`${roundId}-${index}`}
                            label={roundId}
                            size="small"
                            onDelete={() =>
                                onCommit(round.id, {
                                    roundIds: round.roundIds.filter((_id, i) => i !== index),
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
