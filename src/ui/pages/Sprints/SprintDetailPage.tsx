import { Fragment, useCallback, useState, type DragEvent } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import SprintRoundCard from "./SprintRoundCard";
import type { Sprint, SprintRound } from "../../../core/models/Sprint";

type Props = {
    id?: string;
};

/** Local-state-until-blur, same convention as every numeric field in this codebase — a `value` bound straight to
 *  the store would reset mid-typing on every keystroke's re-render. Doesn't resync from `value` after mount
 *  (matches the established convention elsewhere, e.g. BallDetailPage's own NumberField). */
function StageCountField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
    const [text, setText] = useState(value.toString());
    return (
        <TextField
            label="Кол-во этапов"
            type="number"
            size="small"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => {
                const parsed = Number(text);
                if (text.trim() !== "" && Number.isFinite(parsed) && parsed >= 1) {
                    onCommit(Math.floor(parsed));
                } else {
                    setText(value.toString());
                }
            }}
            sx={{ width: 140 }}
        />
    );
}

function makeBlankRound(sprintId: string, stage: number): SprintRound {
    return {
        id: `Sprints:${sprintId}:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        stage,
        roundIds: [],
    };
}

/** A small gap that opens up at the hovered insertion slot while dragging a round card — pushes the surrounding
 *  cards apart just enough to show where it'll land, per the user's own "чуть отодвигать соседей" ask. */
function DropPlaceholder() {
    return (
        <Box
            sx={{
                height: 14,
                borderRadius: 1,
                border: "2px dashed",
                borderColor: "primary.main",
                bgcolor: "primary.main",
                opacity: 0.2,
            }}
        />
    );
}

/** Inserts/repositions `round` into stage `stage`'s group within `rounds` (which must NOT already contain
 *  `round`), at `index` within that stage's own sub-list — or at the END of the stage if `index` is omitted
 *  (used by the quick-move Select and "+ Добавить раунд", which have no drag position to go on). Array order is
 *  rebuilt by concatenating stage groups 1..max in order, so uneven counts per stage are fine and every other
 *  round's relative order is preserved. This is the single place that decides "array position" for the whole
 *  page — every mutation (drag-and-drop, quick-move, add) goes through it, since array position is the only
 *  source of truth for RoundNumber. */
function placeRoundInStage(rounds: SprintRound[], round: SprintRound, stage: number, index?: number): SprintRound[] {
    const maxStage = Math.max(stage, ...rounds.map((r) => r.stage ?? 1));
    const result: SprintRound[] = [];
    for (let s = 1; s <= maxStage; s++) {
        const stageRounds = rounds.filter((r) => (r.stage ?? 1) === s);
        if (s === stage) {
            const insertAt = index === undefined ? stageRounds.length : Math.max(0, Math.min(index, stageRounds.length));
            result.push(...stageRounds.slice(0, insertAt), round, ...stageRounds.slice(insertAt));
        } else {
            result.push(...stageRounds);
        }
    }
    return result;
}

export default function SprintDetailPage({ id: idProp }: Props = {}) {
    const params = useParams<{ id: string }>();
    const id = idProp ?? params.id;
    const store = useStore();
    const sprint = id ? store.getSprint(id) : undefined;
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [draggedRoundId, setDraggedRoundId] = useState<string | null>(null);
    const [dragOverTarget, setDragOverTarget] = useState<{ stage: number; index: number } | null>(null);

    // Every handler passed down to a card is wrapped in useCallback so SprintRoundCard's memo() can actually bail
    // out re-rendering the ~17 cards NOT involved in a given interaction — a plain function value here would be a
    // brand-new reference every render regardless of memo, defeating it entirely. `sprint` itself stays the same
    // object reference across renders that don't touch the store (e.g. a pure dragover-hover), so these callbacks
    // genuinely stay stable in exactly the renders where that matters most.
    //
    // Declared BEFORE the `if (!sprint) return` below, since hooks can't be called conditionally — `sprint` is
    // only guaranteed to exist once we're past that check, so each callback body re-checks it itself. None of
    // these can actually run before that check passes anyway, since the JSX that wires them up only renders after it.
    const updateSprint = useCallback(
        (patch: Partial<Sprint>) => {
            if (!sprint) return;
            store.upsertSprint({ ...sprint, ...patch });
        },
        [store, sprint]
    );

    const handleRoundCommit = useCallback(
        (roundId: string, patch: Partial<SprintRound>) => {
            if (!sprint) return;
            if (patch.stage !== undefined) {
                const target = sprint.rounds.find((r) => r.id === roundId);
                if (!target) return;
                const rest = sprint.rounds.filter((r) => r.id !== roundId);
                updateSprint({ rounds: placeRoundInStage(rest, { ...target, ...patch }, patch.stage) });
                return;
            }
            updateSprint({ rounds: sprint.rounds.map((r) => (r.id === roundId ? { ...r, ...patch } : r)) });
        },
        [sprint, updateSprint]
    );

    const handleRoundDelete = useCallback(
        (roundId: string) => {
            if (!sprint) return;
            updateSprint({ rounds: sprint.rounds.filter((r) => r.id !== roundId) });
        },
        [sprint, updateSprint]
    );

    const handleDragEnd = useCallback(() => {
        setDraggedRoundId(null);
        setDragOverTarget(null);
    }, []);

    /** Only actually updates state (and so only actually triggers a re-render) when the target slot genuinely
     *  changed — native `dragover` fires continuously (many times a second) for as long as the pointer is over an
     *  element, even without it moving, so without this bail-out every single one of those ticks re-rendered the
     *  *entire* board (every stage's every card, ~4 form fields each) regardless of whether anything actually
     *  moved. That was the real cause of the reported drag lag/mis-drops — the event queue backed up under the
     *  re-render cost, so by the time `drop` fired, `dragOverTarget` could be several stale ticks behind the
     *  pointer's real position. Uses the functional setState form so it has zero external dependencies and can
     *  stay a permanently stable reference (see handleCardDragOver below). */
    const setDragOverTargetIfChanged = useCallback((next: { stage: number; index: number }) => {
        setDragOverTarget((prev) => (prev?.stage === next.stage && prev.index === next.index ? prev : next));
    }, []);

    /** Hovering directly over a card — split into top/bottom halves to decide whether the placeholder opens
     *  before or after this card. Stops propagation so the column-level fallback below doesn't immediately
     *  overwrite this with "end of column" as the event bubbles up. Reads `stage`/`index` from the card's own
     *  `data-*` attributes instead of a JS closure, so this ONE function reference can be shared, unchanged,
     *  across all 18 cards — a per-card closure (`(event) => handleCardDragOver(event, stage, index)`) would
     *  itself be a fresh prop value every render, defeating memo() just as badly as an unmemoized handler would.
     *  This turned out to be the real remaining cause of the reported "several seconds to even start dragging" /
     *  "~10 seconds to see the gap" lag — `setDragOverTargetIfChanged`'s equality-gate alone only helped once a
     *  re-render was already cheap; with every card's props churning every render, memo() could never bail, so
     *  every single dragover tick still re-rendered and re-reconciled all 18 cards' full field sets regardless. */
    const handleCardDragOver = useCallback(
        (event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            const stage = Number(event.currentTarget.dataset.stage);
            const index = Number(event.currentTarget.dataset.index);
            const rect = event.currentTarget.getBoundingClientRect();
            const isAfter = event.clientY > rect.top + rect.height / 2;
            setDragOverTargetIfChanged({ stage, index: index + (isAfter ? 1 : 0) });
        },
        [setDragOverTargetIfChanged]
    );

    if (!sprint) {
        return (
            <Stack spacing={2}>
                <Typography variant="h5">Забег не найден</Typography>
                <Button component={RouterLink} to="/sprints">
                    ← К списку забегов
                </Button>
            </Stack>
        );
    }

    const stageCount = store.getSprintStageCount(sprint.id);

    const handleAddRound = (stage: number) => {
        updateSprint({ rounds: placeRoundInStage(sprint.rounds, makeBlankRound(sprint.id, stage), stage) });
    };

    const handleDrop = (stage: number) => {
        if (!draggedRoundId) return;
        const target = sprint.rounds.find((r) => r.id === draggedRoundId);
        if (target) {
            const rest = sprint.rounds.filter((r) => r.id !== draggedRoundId);
            const index = dragOverTarget?.stage === stage ? dragOverTarget.index : undefined;
            updateSprint({ rounds: placeRoundInStage(rest, { ...target, stage }, stage, index) });
        }
        setDraggedRoundId(null);
        setDragOverTarget(null);
    };

    /** Hovering over the column's own empty space (below the last card, or an empty column) — only reached when
     *  no card's handler already claimed the event via stopPropagation. One per stage (3 total), not per card, so
     *  it isn't part of the same memo-defeating multiplication problem and doesn't need the data-attribute trick. */
    const handleColumnDragOver = (event: DragEvent<HTMLElement>, stage: number) => {
        event.preventDefault();
        const count = sprint.rounds.filter((r) => (r.stage ?? 1) === stage && r.id !== draggedRoundId).length;
        setDragOverTargetIfChanged({ stage, index: count });
    };

    const stages = Array.from({ length: stageCount }, (_, index) => index + 1);

    return (
        <Stack spacing={3}>
            <Button component={RouterLink} to="/sprints" size="small" sx={{ alignSelf: "flex-start" }}>
                ← К списку забегов
            </Button>

            <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="h4">{sprint.id}</Typography>
                <StageCountField
                    key={stageCount}
                    value={stageCount}
                    onCommit={(count) => store.setSprintStageCount(sprint.id, count)}
                />
                <Button
                    color="error"
                    variant="outlined"
                    size="small"
                    onClick={() => setConfirmingDelete(true)}
                >
                    Удалить забег
                </Button>
            </Stack>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${stages.length}, minmax(280px, 1fr))`,
                    gap: 2,
                    overflowX: "auto",
                }}
            >
                {stages.map((stage) => {
                    // The dragged round STAYS mounted (just dimmed, see isDragging below) — removing the actual
                    // drag-source DOM node mid-drag breaks the browser's own drag-image tracking (the card no
                    // longer visibly follows the cursor) and can make dragend/drop stop firing reliably (the
                    // round then never reappears, i.e. "disappears"). `stageRoundsForIndex` excludes it only for
                    // computing WHERE the placeholder/insertion index should be — a separate, purely positional
                    // concern from what's actually rendered.
                    const stageRounds = sprint.rounds.filter((round) => (round.stage ?? 1) === stage);
                    const stageRoundsForIndex = stageRounds.filter((round) => round.id !== draggedRoundId);
                    const placeholderIndex =
                        draggedRoundId !== null && dragOverTarget?.stage === stage
                            ? Math.max(0, Math.min(dragOverTarget.index, stageRoundsForIndex.length))
                            : null;

                    return (
                        <Paper
                            key={stage}
                            variant="outlined"
                            onDragOver={(event) => handleColumnDragOver(event, stage)}
                            onDrop={() => handleDrop(stage)}
                            sx={{ p: 2, bgcolor: "action.hover" }}
                        >
                            <Stack spacing={2}>
                                <Typography variant="h6">Этап {stage}</Typography>

                                <Stack spacing={2}>
                                    {stageRounds.map((round) => {
                                        // Both branches below must render the exact same element SHAPE (a
                                        // Fragment wrapping one SprintRoundCard) — branching between a bare
                                        // <SprintRoundCard> and a <Fragment><SprintRoundCard/></Fragment> for the
                                        // same key still makes React treat it as a different element type at that
                                        // list position and tear the DOM node down and rebuild it, which is
                                        // exactly the "detach the drag source mid-drag" bug this isDragging path
                                        // exists to avoid in the first place. Confirmed via a real reconnect check
                                        // (`node.isConnected`) during manual testing — it went false without this.
                                        const isDragging = round.id === draggedRoundId;
                                        const logicalIndex = isDragging ? -1 : stageRoundsForIndex.indexOf(round);
                                        return (
                                            <Fragment key={round.id}>
                                                {!isDragging && placeholderIndex === logicalIndex && <DropPlaceholder />}
                                                <SprintRoundCard
                                                    round={round}
                                                    stageCount={stageCount}
                                                    stage={stage}
                                                    index={logicalIndex}
                                                    onCommit={handleRoundCommit}
                                                    onDelete={handleRoundDelete}
                                                    onDragStart={setDraggedRoundId}
                                                    onDragOver={isDragging ? undefined : handleCardDragOver}
                                                    onDragEnd={handleDragEnd}
                                                    isDragging={isDragging}
                                                />
                                            </Fragment>
                                        );
                                    })}
                                    {placeholderIndex === stageRoundsForIndex.length && <DropPlaceholder />}
                                </Stack>

                                {stageRounds.length === 0 && placeholderIndex === null && (
                                    <Typography variant="body2" color="text.secondary">
                                        Раундов пока нет.
                                    </Typography>
                                )}

                                <Button size="small" onClick={() => handleAddRound(stage)} sx={{ alignSelf: "flex-start" }}>
                                    + Добавить раунд
                                </Button>
                            </Stack>
                        </Paper>
                    );
                })}
            </Box>

            <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
                <DialogTitle>Удалить забег «{sprint.id}»?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Забег будет удалён с сайта сразу. В реальной таблице (Sprints) его строки удалятся только
                        после экспорта забегов.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingDelete(false)}>Отмена</Button>
                    <Button
                        color="error"
                        onClick={() => {
                            store.deleteSprint(sprint.id);
                            setConfirmingDelete(false);
                        }}
                    >
                        Удалить
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
