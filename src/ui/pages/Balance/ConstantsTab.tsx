import { useState } from "react";
import { Paper, Stack, TextField, Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import type { BalanceConfig } from "../../../core/models/BalanceConfig";

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
                    <Typography variant="h6">Порог ступени для «Силы» (N)</Typography>
                    <Typography variant="body2" color="text.secondary">
                        В формуле «Сила» участвуют только те билды предмета, где его собственная ступень не глубже
                        N (0 — сам предмет корень, 1 — прямая связь, и т.д.). Билды глубже N в эту сумму не входят.
                    </Typography>
                    <TextField
                        label="N"
                        type="number"
                        value={draft.qualifyingBuildDepthThreshold}
                        onChange={(event) => {
                            const value = parseCoefficient(event.target.value, draft.qualifyingBuildDepthThreshold);
                            setDraft((prev) => ({ ...prev, qualifyingBuildDepthThreshold: value }));
                        }}
                        onBlur={() => commit(draft)}
                        size="small"
                        slotProps={{ htmlInput: { step: 1, min: 0 } }}
                        sx={{ maxWidth: 200 }}
                    />
                </Stack>
            </Paper>
        </Stack>
    );
}

export default function ConstantsTab() {
    const store = useStore();
    return <ConstantsForm key={store.sharedReady ? "ready" : "loading"} />;
}
