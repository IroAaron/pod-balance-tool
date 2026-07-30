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
                        «Дереве связей» на странице билда. Также здесь задаются: порог ступени N для формулы
                        «Силы» ниже и запасное значение P — используется только когда авто-расчёт P (см. ниже)
                        недоступен для предмета.
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
                        что скейлит его), по всем билдам, где он вообще присутствует, а не только по S. <b>A</b> —
                        общее число предметов. Для каждого билда из S: <b>Q</b> — MoneyValue + MainValue корня
                        этого билда (не обязательно исследуемого предмета — только когда исследуемый предмет сам
                        корень, Q совпадает с его собственными значениями), <b>V</b> — коэффициент ступени, на
                        которой находится исследуемый предмет в этом билде (те же «Коэффициенты по ступеням
                        билда»). Навести курсор на значение силы, чтобы увидеть полную раскладку.
                    </Typography>
                    <Typography variant="body2">
                        <b>P</b> (используется только во «второй» формуле ниже, не в «Силе» выше) — сумма
                        вероятностей появления <b>прямых скейлеров</b> предмета: предметов, с которыми у него есть
                        прямая связь на ступени ровно 1 в билде, где он сам корень (более глубокие, косвенные
                        скейлеры не учитываются). Для каждого такого скейлера отдельно считается его собственная
                        вероятность появления в магазине (раздел «Магазин», таблицы Паки/Колоды: визит показывает 3
                        случайных пака — пул паков считается равновероятным, т.к. реальные веса выбора пака не
                        экспортируются ни в одной таблице; внутри выбранного пака шанс предмета зависит от его веса
                        в колоде и числа розыгрышей), и эти вероятности суммируются в P. Если предмет ни разу не
                        является корнем билда, используется запасное значение P из «Констант».
                    </Typography>
                    <Typography variant="body2">
                        <b>«Сила (мех.)»</b> — второй, независимый расчёт: у предмета может вообще не быть
                        MinValue/MaxValue (тогда обычная «Сила» читается как ~0), но при этом он активирует/красит/
                        спавнит/тегает много всего — это не делает его бесполезным. Формула:
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace", bgcolor: "action.hover", p: 1.5, borderRadius: 1 }}
                    >
                        Сила (мех.) = MoneyValue
                        <br />
                        + [avg × Σ(TargetCount по MechAddValue) × Влияние(MechAddValue)
                        <br />
                        {"  "}+ Σ(TargetCount по T) × Влияние(T), для каждой другой таблицы механик T] × (1 + P)
                        <br />
                        + avg × Σ(коэф. ступени в каждом билде)
                    </Typography>
                    <Typography variant="body2">
                        avg умножает только слагаемое MechAddValue (единственная таблица механик, которая реально
                        про значения) — остальные таблицы (MechActivate/MechChangeColor/MechAddItem/MechAddTag)
                        дают вклад напрямую, даже когда avg = 0. Влияние(T) — вес каждой таблицы, задаётся в
                        «Константах». Только сумма механик домножается на (1 + P), где P — то же самое P, что и в
                        обычной «Силе» (сумма вероятностей появления скейлеров этого предмета, см. выше): чем
                        вероятнее, что скейлеры реально выпадут в игре, тем больше бонус сверху. MoneyValue и вклад
                        от билдов P не затрагивает — при P = 0 (нет прямых скейлеров) формула не обнуляется, а
                        просто не получает бонуса, «(1 + P)», а не голое «× P».
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
