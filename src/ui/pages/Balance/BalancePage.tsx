import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import ConstantsTab from "./ConstantsTab";
import ItemPowerTab from "./ItemPowerTab";

type TabKey = "constants" | "power";

function BalanceHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Как считается баланс</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pb: 1 }}>
                    <Typography variant="body2">
                        <b>«Константы»</b> — здесь задаются коэффициенты для каждой «ступени» (глубины) в графе
                        скейлинга билда: 0 — сам предмет как корень билда, 1 — то, что напрямую скейлит этот
                        корень, 2 — то, что скейлит предметы уровня 1, и так далее. Это тот же граф, что показан во
                        «Дереве связей» на странице билда. Также здесь задаётся P — вероятность появления
                        скейл-челов.
                    </Typography>
                    <Typography variant="body2">
                        <b>«Сила предметов»</b> — для каждого предмета (кроме тиров прокачки +/++) считается сила
                        по формуле:
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace", bgcolor: "action.hover", p: 1.5, borderRadius: 1 }}
                    >
                        Сила = (MoneyValue + avg) + avg × (1 + P) + avg × Σ(коэф. ступени в каждом билде)
                        <br />
                        где avg = (ValueMin + ValueMax) / 2
                    </Typography>
                    <Typography variant="body2">
                        Если предмет входит в несколько билдов, суммируются коэффициенты его ступени в каждом из
                        них. Если предмет присутствует в билде, но не был структурно классифицирован генератором
                        (нет прямой связи с корнем этого билда), он не учитывается в этой сумме — навести курсор
                        на значение силы, чтобы увидеть полную раскладку по переменным и билдам.
                    </Typography>
                </Stack>
            </DialogContent>
        </Dialog>
    );
}

export default function BalancePage() {
    const [tab, setTab] = useState<TabKey>("constants");
    const [helpOpen, setHelpOpen] = useState(false);

    return (
        <>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                <Typography variant="h4">Баланс</Typography>
                <Tooltip title="Как считается баланс">
                    <IconButton size="small" aria-label="Как считается баланс" onClick={() => setHelpOpen(true)}>
                        <HelpOutlineIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Stack>

            <Tabs value={tab} onChange={(_event, next: TabKey) => setTab(next)} sx={{ mb: 3 }}>
                <Tab value="constants" label="Константы" />
                <Tab value="power" label="Сила предметов" />
            </Tabs>

            {tab === "constants" ? <ConstantsTab /> : <ItemPowerTab />}

            <BalanceHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
        </>
    );
}
