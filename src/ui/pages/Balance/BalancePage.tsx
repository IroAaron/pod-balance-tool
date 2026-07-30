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
                        «Дереве связей» на странице билда. Также здесь задаётся порог ступени N для формулы «Силы»
                        ниже.
                    </Typography>
                    <Typography variant="body2">
                        <b>«Сила предметов»</b> — для каждого предмета (кроме тиров прокачки +/++) считается сила
                        по формуле:
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace", bgcolor: "action.hover", p: 1.5, borderRadius: 1 }}
                    >
                        Сила = (MoneyValue + MainValue) + (|S| × (M + 1) / A) × Σ(Q × V)
                        <br />
                        где MainValue = (ValueMin + ValueMax) / 2
                    </Typography>
                    <Typography variant="body2">
                        <b>S</b> — билды, в которых предмет находится на ступени не глубже N (порог N задаётся в
                        «Константах»); |S| — их количество. <b>M</b> — количество уникальных предметов, с которыми
                        у исследуемого предмета есть прямая связь (в обе стороны — и то, что он сам скейлит, и то,
                        что скейлит его), но только внутри билдов из S — если билд не попал в S (глубже N), его
                        связи в M не учитываются, даже если это реальный прямой скейлер. <b>A</b> —
                        общее число предметов. Для каждого билда из S: <b>Q</b> — MoneyValue + MainValue корня
                        этого билда (не обязательно исследуемого предмета — только когда исследуемый предмет сам
                        корень, Q совпадает с его собственными значениями), <b>V</b> — коэффициент ступени, на
                        которой находится исследуемый предмет в этом билде (те же «Коэффициенты по ступеням
                        билда»). Навести курсор на значение силы, чтобы увидеть полную раскладку.
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
