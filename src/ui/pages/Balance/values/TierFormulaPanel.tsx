import { useMemo, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useStore } from "../../../hooks/useStore";
import { validateFormula } from "../../../../core/domain/formula";
import { BALANCED_COLUMNS, type BalancedColumn } from "../../../../core/domain/rarityBalance";
import { TIER_FORMULA_VARIABLES, computeTierUpdates } from "../../../../core/domain/tierFormula";
import type { Item } from "../../../../core/models/Item";

interface Props {
    /** Chains built from the items currently in scope, first tier first. */
    chains: Item[][];
}

const VARIABLE_HINTS: Record<string, string> = {
    prev: "значение этой же колонки у предыдущего тира",
    base: "значение этой же колонки у первого тира цепочки",
    tier: "номер тира, который считаем (2, 3, ...)",
    min: "ValueMin предыдущего тира",
    max: "ValueMax предыдущего тира",
    money: "MoneyValue предыдущего тира",
    overheat: "Overheat предыдущего тира",
};

type Formulas = Partial<Record<BalancedColumn, string>>;

/**
 * Formulas that derive each upgrade tier from the one before it. Every real chain in the config grows ×2 per
 * tier today, so `prev * 2` reproduces the current data exactly — which makes it a safe thing to type in and
 * see "изменится: 0" before actually changing the growth rate.
 *
 * Nothing is written until the preview dialog is confirmed: this touches two rows per chain at once, and a
 * mistyped formula across 70 chains is not something to discover after the fact.
 */
export default function TierFormulaPanel({ chains }: Props) {
    const store = useStore();
    const [formulas, setFormulas] = useState<Formulas>({});
    const [previewOpen, setPreviewOpen] = useState(false);

    const errors = useMemo(() => {
        const found: Partial<Record<BalancedColumn, string>> = {};
        for (const entry of BALANCED_COLUMNS) {
            const source = (formulas[entry.column] ?? "").trim();
            if (!source) continue;
            const error = validateFormula(source, [...TIER_FORMULA_VARIABLES]);
            if (error) found[entry.column] = error;
        }
        return found;
    }, [formulas]);

    const hasErrors = Object.keys(errors).length > 0;
    const hasFormula = BALANCED_COLUMNS.some((entry) => (formulas[entry.column] ?? "").trim() !== "");

    const result = useMemo(
        () => (hasFormula && !hasErrors ? computeTierUpdates(chains, formulas) : { changes: [], skips: [] }),
        [chains, formulas, hasFormula, hasErrors]
    );

    const apply = () => {
        // Group by item so each row is one store write rather than one per column.
        const byItem = new Map<string, Record<string, string>>();
        for (const change of result.changes) {
            const patch = byItem.get(change.itemId) ?? {};
            patch[change.column] = change.to;
            byItem.set(change.itemId, patch);
        }
        for (const [itemId, patch] of byItem) {
            const item = store.getItem(itemId);
            if (item) store.upsertItem(itemId, item.itemType ?? "Card", { raw: patch });
        }
        setPreviewOpen(false);
    };

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
                <Box>
                    <Typography variant="subtitle2">Формула прокачки</Typography>
                    <Typography variant="caption" color="text.secondary">
                        Считает каждый следующий тир из предыдущего, каскадом: третий — уже из посчитанного
                        второго. Пустое поле — колонку не трогаем. Применяется к цепочкам, попавшим в фильтр
                        ({chains.length} шт.).
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", rowGap: 1.5 }}>
                    {BALANCED_COLUMNS.map((entry) => (
                        <TextField
                            key={entry.column}
                            size="small"
                            label={entry.label}
                            placeholder="prev * 2"
                            value={formulas[entry.column] ?? ""}
                            onChange={(event) =>
                                setFormulas((current) => ({ ...current, [entry.column]: event.target.value }))
                            }
                            error={Boolean(errors[entry.column])}
                            helperText={errors[entry.column]}
                            sx={{ width: 210 }}
                        />
                    ))}
                </Stack>

                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, alignItems: "center" }}>
                    <Typography variant="caption" color="text.secondary">
                        Переменные:
                    </Typography>
                    {TIER_FORMULA_VARIABLES.map((name) => (
                        <Tooltip key={name} title={VARIABLE_HINTS[name] ?? ""}>
                            <Chip label={name} size="small" variant="outlined" sx={{ cursor: "help" }} />
                        </Tooltip>
                    ))}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        Функции: round, floor, ceil, abs, min, max, clamp
                    </Typography>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Button
                        variant="contained"
                        size="small"
                        disabled={!hasFormula || hasErrors || result.changes.length === 0}
                        onClick={() => setPreviewOpen(true)}
                    >
                        Посмотреть, что изменится ({result.changes.length})
                    </Button>
                    {hasFormula && !hasErrors && result.changes.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                            Формула даёт ровно те значения, что уже стоят — менять нечего.
                        </Typography>
                    )}
                    {result.skips.length > 0 && (
                        <Typography variant="caption" color="warning.main">
                            Пропущено: {result.skips.length}
                        </Typography>
                    )}
                </Stack>
            </Stack>

            <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Применить формулу к прокачкам?</DialogTitle>
                <DialogContent>
                    <Stack spacing={2}>
                        <Alert severity="info">
                            Изменится {result.changes.length} значений. Правки появятся сразу на сайте; в таблицу
                            они уйдут только при экспорте на странице «Источники».
                        </Alert>

                        <TableContainer sx={{ maxHeight: 380 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Предмет</TableCell>
                                        <TableCell>Тир</TableCell>
                                        <TableCell>Колонка</TableCell>
                                        <TableCell align="right">Было</TableCell>
                                        <TableCell align="right">Станет</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {result.changes.map((change) => {
                                        const item = store.getItem(change.itemId);
                                        return (
                                            <TableRow key={`${change.itemId}-${change.column}`}>
                                                <TableCell>
                                                    <Typography variant="body2">
                                                        {item ? store.itemName(item) : change.itemId}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {change.itemId}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>{change.tier}</TableCell>
                                                <TableCell>{change.column}</TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="text.secondary">
                                                        {change.from || "—"}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                        {change.to}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        {result.skips.length > 0 && (
                            <Alert severity="warning">
                                <Typography variant="body2" sx={{ mb: 0.5 }}>
                                    Пропущено {result.skips.length} — считать не от чего:
                                </Typography>
                                {result.skips.slice(0, 8).map((skip, index) => (
                                    <Typography key={`${skip.itemId}-${skip.column}-${index}`} variant="caption" sx={{ display: "block" }}>
                                        • {skip.itemId} · {skip.column} — {skip.reason}
                                    </Typography>
                                ))}
                                {result.skips.length > 8 && (
                                    <Typography variant="caption">…и ещё {result.skips.length - 8}</Typography>
                                )}
                            </Alert>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPreviewOpen(false)}>Отмена</Button>
                    <Button variant="contained" onClick={apply}>
                        Применить
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}
