import { Fragment, useCallback, useRef, useState, type DragEvent } from "react";
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

/** A gap that opens up at the hovered insertion slot while dragging a round card — pushes the surrounding cards
 *  apart just enough to show where it'll land, per the user's own "чуть отодвигать соседей" ask. */
function DropPlaceholder() {
    return (
        <Box
            sx={{
                height: 20,
                borderRadius: 1,
                border: "2px dashed",
                borderColor: "primary.main",
                bgcolor: "primary.main",
                opacity: 0.25,
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
    // Native `dragover` only fires while the pointer is over a listening element — there's no native "you've left
    // every drop target" event that's reliable across browsers (dragleave fires on every inter-element boundary
    // crossing too, including between a card and its own children, so it flickers constantly). Instead: every
    // dragover resets a short timer; if none arrives before it fires, nothing is being hovered anymore, so the
    // placeholder clears. Since the dragged card never actually left its own slot (see isDragging's own doc),
    // clearing the placeholder IS "the card returns to its position" — and handleDrop below refuses to move
    // anything unless dragOverTarget is actually set at drop time, so a drop with no settled target is a no-op.
    const dragOverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Snapshot of every card's own rect (keyed by round id), taken ONCE at dragstart — see handleRoundDragStart —
    // and read (never re-measured) by handleColumnDragOver for the rest of the drag. Measuring live instead (the
    // first version of this did) creates a feedback loop: the placeholder's own presence pushes the cards below it
    // down, which shifts their rects, which the very next dragover tick (native dragover fires continuously even
    // with the pointer dead still) reads back and can compute a DIFFERENT target index from, moving the placeholder
    // again, shifting the cards again — an endless back-and-forth the user sees as cards "settling" and then
    // immediately un-settling. A frozen pre-drag snapshot removes the feedback: the layout used for hit-testing
    // never itself changes during the drag, only the *cursor* position does.
    const boardRef = useRef<HTMLDivElement | null>(null);
    const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());

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

    /** Captures the pre-drag layout snapshot (see cardRectsRef's own doc) before marking anything as dragging —
     *  at this exact instant no placeholder exists anywhere yet, so every card's rect reflects its true rest
     *  position. Scoped to boardRef since a round can move between stage columns, so the whole board needs
     *  capturing, not just the column the drag started in. */
    const handleRoundDragStart = useCallback((id: string) => {
        const rects = new Map<string, DOMRect>();
        boardRef.current?.querySelectorAll<HTMLElement>("[data-round-id]").forEach((el) => {
            const roundId = el.dataset.roundId;
            if (roundId) rects.set(roundId, el.getBoundingClientRect());
        });
        cardRectsRef.current = rects;
        setDraggedRoundId(id);
    }, []);

    const clearDragOverTimeout = useCallback(() => {
        if (dragOverClearTimeoutRef.current !== undefined) {
            clearTimeout(dragOverClearTimeoutRef.current);
            dragOverClearTimeoutRef.current = undefined;
        }
    }, []);

    const handleDragEnd = useCallback(() => {
        clearDragOverTimeout();
        setDraggedRoundId(null);
        setDragOverTarget(null);
    }, [clearDragOverTimeout]);

    /** Only actually updates state (and so only actually triggers a re-render) when the target slot genuinely
     *  changed — native `dragover` fires continuously for as long as the pointer is over an element, even without
     *  it moving, so without this bail-out every single one of those ticks re-rendered the *entire* board
     *  regardless of whether anything actually moved. Also re-arms the "nothing is being hovered" timeout on every
     *  call, whether or not the target actually changed.
     *
     *  That timeout must stay comfortably ABOVE the browser's own native re-fire interval for a stationary
     *  pointer: per the HTML Drag and Drop spec, the user agent only re-dispatches `dragover` roughly every
     *  350ms while nothing changes, NOT continuously — a shorter clear-timeout (150ms was tried first) means
     *  every time the pointer genuinely stops moving, even while still sitting over a perfectly valid slot, our
     *  own timer fires and clears the target before the next native tick has a chance to re-arm it, which read as
     *  the cards "changing their mind" and un-shifting the moment the pointer held still. 500ms gives enough
     *  margin above that ~350ms interval that a stationary-but-still-hovering pointer never gets cleared, while a
     *  pointer that's truly left every drop target still resolves to "return to original position" well within
     *  half a second. */
    const setDragOverTargetIfChanged = useCallback((next: { stage: number; index: number }) => {
        setDragOverTarget((prev) => (prev?.stage === next.stage && prev.index === next.index ? prev : next));
        if (dragOverClearTimeoutRef.current !== undefined) clearTimeout(dragOverClearTimeoutRef.current);
        dragOverClearTimeoutRef.current = setTimeout(() => {
            dragOverClearTimeoutRef.current = undefined;
            setDragOverTarget(null);
        }, 500);
    }, []);

    /**
     * Fires for ANY dragover anywhere within a stage column — there's exactly ONE of these per column (3 total),
     * attached to the column's own Paper, not one per card. Rather than relying on WHICH specific card element the
     * event happens to bubble from (the earlier per-card-delegation design — that meant the only "sensitive" zone
     * for a given insertion point was whatever DOM element the browser's hit-testing picked for that exact pixel,
     * which in practice meant needing near-pixel-perfect aim right at a card's own edge to land a specific
     * position), this measures the pointer's Y position against every currently-rendered (non-dragged) card's own
     * midpoint directly via `getBoundingClientRect()`, and picks whichever slot it's actually closest to being
     * above. This is correct and forgiving for EVERY point in the column, not just the boundary pixels — it's the
     * same geometric-comparison technique standard drag-reorder libraries (dnd-kit, SortableJS, etc.) use, and it
     * needed no `data-*`/per-card-closure plumbing at all once the "compare against real element positions" idea
     * replaced "guess from which nested element received the event."
     *
     * Reads rects from `cardRectsRef`'s frozen pre-drag snapshot, NOT a live query of the DOM — see that ref's own
     * doc for why measuring live here creates a placeholder-vs-layout feedback loop.
     */
    const handleColumnDragOver = (event: DragEvent<HTMLElement>, stage: number) => {
        event.preventDefault();
        if (!draggedRoundId || !sprint) return;
        const stageRoundIds = sprint.rounds
            .filter((round) => (round.stage ?? 1) === stage && round.id !== draggedRoundId)
            .map((round) => round.id);
        let index = stageRoundIds.length;
        for (let i = 0; i < stageRoundIds.length; i++) {
            const rect = cardRectsRef.current.get(stageRoundIds[i]);
            if (rect && event.clientY < rect.top + rect.height / 2) {
                index = i;
                break;
            }
        }
        setDragOverTargetIfChanged({ stage, index });
    };

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

    /** Only actually moves the round if `dragOverTarget` is still set AND points at this exact stage — i.e. only
     *  if the pointer was genuinely hovering a real position here right before the drop. If it's null (cleared by
     *  the "nothing hovered" timeout above) or points elsewhere, the round is left exactly where it started —
     *  dropping without ever settling on a specific position cancels the move instead of guessing "append to the
     *  end of whichever column happened to be under the cursor," which is what used to happen and read as the
     *  round "flying to the end of its stage" for no clear reason. */
    const handleDrop = (stage: number) => {
        if (!draggedRoundId) return;
        clearDragOverTimeout();
        if (dragOverTarget?.stage === stage) {
            const target = sprint.rounds.find((r) => r.id === draggedRoundId);
            if (target) {
                const rest = sprint.rounds.filter((r) => r.id !== draggedRoundId);
                updateSprint({ rounds: placeRoundInStage(rest, { ...target, stage }, stage, dragOverTarget.index) });
            }
        }
        setDraggedRoundId(null);
        setDragOverTarget(null);
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
                ref={boardRef}
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
                                                    onCommit={handleRoundCommit}
                                                    onDelete={handleRoundDelete}
                                                    onDragStart={handleRoundDragStart}
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
