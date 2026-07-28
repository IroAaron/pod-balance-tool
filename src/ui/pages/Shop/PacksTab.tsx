import { useMemo, useState } from "react";
import {
    Chip,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import { useStore } from "../../hooks/useStore";
import { isShopSlotPack } from "../../../core/domain/shopProbability";

/** Read-only table of every imported Pack row — see domain/shopProbability.ts for what each column feeds into. */
export default function PacksTab() {
    const store = useStore();
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return store.packs;
        return store.packs.filter(
            (pack) =>
                pack.packId.toLowerCase().includes(normalized) || pack.sourceDeckId.toLowerCase().includes(normalized)
        );
    }, [store.packs, query]);

    return (
        <Stack spacing={2}>
            <TextField
                label="Поиск по PackId / SourceDeckId"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                size="small"
                sx={{ maxWidth: 320 }}
            />

            <Typography variant="body2" color="text.secondary">
                Найдено: {filtered.length} из {store.packs.length}
            </Typography>

            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>PackId</TableCell>
                            <TableCell>Колода</TableCell>
                            <TableCell align="right">Cost</TableCell>
                            <TableCell align="right">ItemsToTake</TableCell>
                            <TableCell align="right">ItemNumber</TableCell>
                            <TableCell>Повторы</TableCell>
                            <TableCell>В магазине</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filtered.map((pack) => (
                            <TableRow key={pack.id} hover>
                                <TableCell>{pack.packId}</TableCell>
                                <TableCell>
                                    <Typography variant="caption" color="text.secondary">
                                        {pack.sourceDeckId}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">{pack.cost ?? "—"}</TableCell>
                                <TableCell align="right">{pack.itemsToTake ?? "—"}</TableCell>
                                <TableCell align="right">{pack.itemNumber ?? "—"}</TableCell>
                                <TableCell>{pack.allowDuplicates ? "да" : "нет"}</TableCell>
                                <TableCell>
                                    {isShopSlotPack(pack) ? (
                                        <Chip label="да" size="small" color="primary" variant="outlined" />
                                    ) : (
                                        <Chip label="нет" size="small" variant="outlined" />
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {store.packs.length === 0 && (
                <Typography color="text.secondary">
                    Паков пока нет — загрузите таблицу Packs на странице «Источники».
                </Typography>
            )}
        </Stack>
    );
}
