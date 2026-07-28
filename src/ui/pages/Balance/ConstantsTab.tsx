import { useState } from "react";
import { Paper, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import type { BalanceConfig } from "../../../core/models/BalanceConfig";
import { KNOWN_MECHANIC_TABLES } from "../../../core/domain/mechanicTables";

function parseCoefficient(value: string, fallback: number): number {
    if (value.trim() === "") return 0;
    const parsed = Number(value.replace(",", "."));
    return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Owns the actual form — local state seeded once from `store.balanceConfig`, remounted (via the wrapper below's
 * `key`) once the real Firestore value replaces the DEFAULT_BALANCE_CONFIG placeholder. Same reasoning/pattern as
 * SettingsPage's SettingsForm — without this, a fresh page load would show (and could commit back) stale defaults
 * until some other field is touched. Commits on blur, not per keystroke, so typing a multi-digit coefficient
 * doesn't fire a Firestore write per character.
 */
function ConstantsForm() {
    const store = useStore();
    const [draft, setDraft] = useState<BalanceConfig>(store.balanceConfig);

    const commit = (next: BalanceConfig) => store.setBalanceConfig(next);

    const depths = Object.keys(draft.depthCoefficients)
        .map(Number)
        .sort((a, b) => a - b);

    return (
        <Stack spacing={3} sx={{ maxWidth: 640 }}>
            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Вероятность появления скейлеров (P)</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Для предметов, которые являются корнем билда, P считается автоматически — как сумма
                        вероятностей появления в магазине их скейлеров (таблицы «Магазин → Паки/Колоды»). Значение
                        ниже — запасное, используется только для предметов, которые никогда не являются корнем
                        билда.
                    </Typography>
                    <TextField
                        label="P (запасное значение)"
                        type="number"
                        value={draft.scaleChelAppearanceProbability}
                        onChange={(event) => {
                            const value = parseCoefficient(event.target.value, draft.scaleChelAppearanceProbability);
                            setDraft((prev) => ({ ...prev, scaleChelAppearanceProbability: value }));
                        }}
                        onBlur={() => commit(draft)}
                        size="small"
                        slotProps={{ htmlInput: { step: 0.01 } }}
                        sx={{ maxWidth: 200 }}
                    />
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Коэффициенты по ступеням билда</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Ступень 0 — сам предмет как корень билда. Ступень N — предметы, скейлящие корень через N
                        шагов графа генерации (тот же граф, что показан во «Дереве связей» на странице билда).
                    </Typography>
                    <Stack spacing={1.5}>
                        {depths.map((depth) => (
                            <TextField
                                key={depth}
                                label={depth === 0 ? "Ступень 0 (корень билда)" : `Ступень ${depth}`}
                                type="number"
                                value={draft.depthCoefficients[depth] ?? 0}
                                onChange={(event) => {
                                    const value = parseCoefficient(event.target.value, draft.depthCoefficients[depth] ?? 0);
                                    setDraft((prev) => ({
                                        ...prev,
                                        depthCoefficients: { ...prev.depthCoefficients, [depth]: value },
                                    }));
                                }}
                                onBlur={() => commit(draft)}
                                size="small"
                                slotProps={{ htmlInput: { step: 0.1 } }}
                                sx={{ maxWidth: 260 }}
                            />
                        ))}
                    </Stack>
                </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Влияние механик</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Второй, независимый расчёт силы («Сила (мех.)» на вкладке «Сила предметов») — учитывает
                        предметы без MinValue/MaxValue, но с активациями/эффектами: MoneyValue + avg×Σ(TargetCount
                        по MechAddValue)×Влияние + Σ(TargetCount по остальным механикам)×Влияние + тот же вклад от
                        ступеней в билдах. Значение ниже — вес каждой таблицы механик в этой формуле.
                    </Typography>
                    <Stack spacing={1.5}>
                        {KNOWN_MECHANIC_TABLES.map((table) => (
                            <TextField
                                key={table}
                                label={table}
                                type="number"
                                value={draft.mechanicInfluence[table] ?? 0}
                                onChange={(event) => {
                                    const value = parseCoefficient(event.target.value, draft.mechanicInfluence[table] ?? 0);
                                    setDraft((prev) => ({
                                        ...prev,
                                        mechanicInfluence: { ...prev.mechanicInfluence, [table]: value },
                                    }));
                                }}
                                onBlur={() => commit(draft)}
                                size="small"
                                slotProps={{ htmlInput: { step: 0.1 } }}
                                sx={{ maxWidth: 260 }}
                            />
                        ))}
                    </Stack>
                </Stack>
            </Paper>
        </Stack>
    );
}

export default function ConstantsTab() {
    const store = useStore();
    return <ConstantsForm key={store.sharedReady ? "ready" : "loading"} />;
}
