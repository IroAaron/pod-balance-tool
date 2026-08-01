import { useState } from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    Paper,
    Stack,
    Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useStore } from "../../hooks/useStore";
import BallGroupEntryRow from "./BallGroupEntryRow";
import type { BallGroup } from "../../../core/models/BallGroup";

/** Real BallGroups.csv shape: DeckId + up to 7 repeated `Ball` columns — see replaceWideGroupRow's doc. */
const MAX_BALLS = 7;

type Props = {
    group: BallGroup;
};

export default function BallGroupCard({ group }: Props) {
    const store = useStore();
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const updateBallIds = (nextBallIds: string[]) => {
        store.upsertBallGroup({ ...group, ballIds: nextBallIds });
    };

    const handleRowCommit = (index: number, ballId: string) => {
        updateBallIds(group.ballIds.map((id, i) => (i === index ? ballId : id)));
    };

    const handleRowDelete = (index: number) => {
        updateBallIds(group.ballIds.filter((_id, i) => i !== index));
    };

    const handleAddEntry = () => {
        updateBallIds([...group.ballIds, ""]);
    };

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {group.id}
                    </Typography>
                    <IconButton aria-label="Удалить колоду шаров" size="small" onClick={() => setConfirmingDelete(true)}>
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Stack>

                <Stack spacing={1}>
                    {group.ballIds.map((ballId, index) => (
                        <BallGroupEntryRow
                            key={index}
                            ballId={ballId}
                            index={index}
                            onCommit={handleRowCommit}
                            onDelete={handleRowDelete}
                        />
                    ))}
                </Stack>

                {group.ballIds.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        Пока нет шаров.
                    </Typography>
                )}

                <Button
                    size="small"
                    onClick={handleAddEntry}
                    disabled={group.ballIds.length >= MAX_BALLS}
                    sx={{ alignSelf: "flex-start" }}
                >
                    + Добавить шар
                </Button>
            </Stack>

            <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
                <DialogTitle>Удалить колоду шаров «{group.id}»?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Колода будет удалена с сайта сразу. В реальной таблице (BallGroups) её строка
                        удалится только после экспорта колод.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingDelete(false)}>Отмена</Button>
                    <Button
                        color="error"
                        onClick={() => {
                            store.deleteBallGroup(group.id);
                            setConfirmingDelete(false);
                        }}
                    >
                        Удалить
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}
