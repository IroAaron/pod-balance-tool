import { memo } from "react";
import { Autocomplete, IconButton, Stack, TextField } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";
import type { Ball } from "../../../core/models/Ball";

type Props = {
    ballId: string;

    index: number;

    onCommit: (index: number, ballId: string) => void;

    onDelete: (index: number) => void;
};

/** One ball-deck slot — no weight/cost (unlike DeckEntryRow), just a ball Autocomplete that commits immediately
 *  on selection, matching the "discrete action" convention DeckEntryRow already uses for its own item picker. */
const BallGroupEntryRow = memo(function BallGroupEntryRow({ ballId, index, onCommit, onDelete }: Props) {
    const store = useStore();
    const selectedBall = store.getBall(ballId) ?? null;

    return (
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Autocomplete
                sx={{ flex: 1, minWidth: 260 }}
                size="small"
                options={store.balls}
                value={selectedBall}
                getOptionLabel={(ball: Ball) => `${store.ballName(ball)} (${ball.id})`}
                onChange={(_event, ball) => onCommit(index, ball?.id ?? "")}
                renderInput={(params) => <TextField {...params} label="Шар" placeholder={ballId || undefined} />}
            />

            <IconButton aria-label="Удалить шар из колоды" size="small" onClick={() => onDelete(index)}>
                <CloseIcon fontSize="small" />
            </IconButton>
        </Stack>
    );
});

export default BallGroupEntryRow;
