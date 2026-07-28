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
                        «Дереве связей» на странице билда. Также здесь задаётся запасное значение P — используется
                        только когда авто-расчёт (см. ниже) недоступен для предмета.
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
                    <Typography variant="body2">
                        <b>P — это не вероятность появления самого предмета</b>, а сумма вероятностей появления
                        его <b>скейлеров</b>: предметов, которые скейлят именно этот предмет (участники билда, где
                        этот предмет — корень, т.е. ступень ≥ 1 в его собственном графе). Для каждого такого
                        скейлера отдельно считается его собственная вероятность появления в магазине (раздел
                        «Магазин», таблицы Паки/Колоды: визит показывает 3 случайных пака — пул паков считается
                        равновероятным, т.к. реальные веса выбора пака не экспортируются ни в одной таблице; внутри
                        выбранного пака шанс предмета зависит от его веса в колоде и числа розыгрышей), и эти
                        вероятности суммируются в P. Если предмет ни разу не является корнем билда (например, он
                        только скейлер, а не билд сам по себе), используется запасное значение P из «Констант».
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
