import { useState } from "react";
import { Button, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import BallGroupCard from "./BallGroupCard";

export default function BallGroupList() {
    const store = useStore();
    const [newGroupId, setNewGroupId] = useState("");

    const trimmedNewId = newGroupId.trim();
    const alreadyExists = trimmedNewId !== "" && store.getBallGroup(trimmedNewId) !== undefined;

    const handleCreate = () => {
        if (!trimmedNewId || alreadyExists) return;
        store.createBallGroup(trimmedNewId);
        setNewGroupId("");
    };

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                <TextField
                    label="Id новой колоды шаров"
                    size="small"
                    value={newGroupId}
                    onChange={(event) => setNewGroupId(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") handleCreate();
                    }}
                    error={alreadyExists}
                    helperText={alreadyExists ? "Колода шаров с таким id уже есть" : undefined}
                />
                <Button variant="contained" onClick={handleCreate} disabled={!trimmedNewId || alreadyExists}>
                    + Создать колоду шаров
                </Button>
            </Stack>

            {store.ballGroups.length === 0 && <Typography color="text.secondary">Колод шаров пока нет.</Typography>}

            <Stack spacing={2}>
                {store.ballGroups.map((group) => (
                    <BallGroupCard key={group.id} group={group} />
                ))}
            </Stack>
        </Stack>
    );
}
