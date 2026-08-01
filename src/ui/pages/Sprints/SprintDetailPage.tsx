import { useState } from "react";
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

/** Inserts/repositions `round` at the END of stage `stage`'s group within `rounds` (which must NOT already
 *  contain `round`) — array order is rebuilt by concatenating stage groups 1..max in order, so uneven counts per
 *  stage are fine and every other round's relative order is preserved. This is the single place that decides
 *  "array position" for the whole page — both the stage-board drag-and-drop and the quick-move Select and
 *  "+ Добавить раунд" all go through it, since array position is the only source of truth for RoundNumber. */
function placeRoundAtEndOfStage(rounds: SprintRound[], round: SprintRound, stage: number): SprintRound[] {
    const maxStage = Math.max(stage, ...rounds.map((r) => r.stage ?? 1));
    const result: SprintRound[] = [];
    for (let s = 1; s <= maxStage; s++) {
        result.push(...rounds.filter((r) => (r.stage ?? 1) === s));
        if (s === stage) result.push(round);
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

    const updateSprint = (patch: Partial<Sprint>) => {
        store.upsertSprint({ ...sprint, ...patch });
    };

    const handleRoundCommit = (roundId: string, patch: Partial<SprintRound>) => {
        if (patch.stage !== undefined) {
            const target = sprint.rounds.find((r) => r.id === roundId);
            if (!target) return;
            const rest = sprint.rounds.filter((r) => r.id !== roundId);
            updateSprint({ rounds: placeRoundAtEndOfStage(rest, { ...target, ...patch }, patch.stage) });
            return;
        }
        updateSprint({ rounds: sprint.rounds.map((r) => (r.id === roundId ? { ...r, ...patch } : r)) });
    };

    const handleRoundDelete = (roundId: string) => {
        updateSprint({ rounds: sprint.rounds.filter((r) => r.id !== roundId) });
    };

    const handleAddRound = (stage: number) => {
        updateSprint({ rounds: placeRoundAtEndOfStage(sprint.rounds, makeBlankRound(sprint.id, stage), stage) });
    };

    const handleDrop = (stage: number) => {
        if (!draggedRoundId) return;
        const target = sprint.rounds.find((r) => r.id === draggedRoundId);
        if (target) {
            const rest = sprint.rounds.filter((r) => r.id !== draggedRoundId);
            updateSprint({ rounds: placeRoundAtEndOfStage(rest, { ...target, stage }, stage) });
        }
        setDraggedRoundId(null);
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
                    const stageRounds = sprint.rounds.filter((round) => (round.stage ?? 1) === stage);
                    return (
                        <Paper
                            key={stage}
                            variant="outlined"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => handleDrop(stage)}
                            sx={{ p: 2, bgcolor: "action.hover" }}
                        >
                            <Stack spacing={2}>
                                <Typography variant="h6">Этап {stage}</Typography>

                                <Stack spacing={2}>
                                    {stageRounds.map((round) => (
                                        <SprintRoundCard
                                            key={round.id}
                                            round={round}
                                            stageCount={stageCount}
                                            onCommit={handleRoundCommit}
                                            onDelete={handleRoundDelete}
                                            onDragStart={setDraggedRoundId}
                                        />
                                    ))}
                                </Stack>

                                {stageRounds.length === 0 && (
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
