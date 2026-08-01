import { useState } from "react";
import { Button, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import BallGroupCard from "./BallGroupCard";

export default function BallGroupList() {
    const store = useStore();
    const [newGroupId, setNewGroupId] = useState("");
    const [query, setQuery] = useState("");

    const trimmedNewId = newGroupId.trim();
    const alreadyExists = trimmedNewId !== "" && store.getBallGroup(trimmedNewId) !== undefined;

    const handleCreate = () => {
        if (!trimmedNewId || alreadyExists) return;
        store.createBallGroup(trimmedNewId);
        setNewGroupId("");
    };

    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
        ? store.ballGroups.filter(
              (group) =>
                  group.id.toLowerCase().includes(normalizedQuery) ||
                  (store.getDeckName(group.id) ?? "").toLowerCase().includes(normalizedQuery)
          )
        : store.ballGroups;

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", flexWrap: "wrap" }}>
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
                <TextField
                    label="Поиск (id или название)"
                    size="small"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    sx={{ minWidth: 240 }}
                />
            </Stack>

            {store.ballGroups.length === 0 && <Typography color="text.secondary">Колод шаров пока нет.</Typography>}

            {store.ballGroups.length > 0 && filtered.length === 0 && (
                <Typography color="text.secondary">Ничего не найдено по этому запросу.</Typography>
            )}

            <Stack spacing={2}>
                {filtered.map((group) => (
                    <BallGroupCard key={group.id} group={group} />
                ))}
            </Stack>
        </Stack>
    );
}
