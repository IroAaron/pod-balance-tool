import { useState } from "react";
import { Alert, Box, Chip, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useStore } from "../../hooks/useStore";
import { useEnumRegistry } from "../../components/content/EnumRegistryContext";
import { FIELD_TO_DIMENSION } from "../../components/content/enumData";

/** Which config columns draw their dropdown from this dimension — the practical "what does this affect". */
function columnsUsing(dimension: string): string[] {
    return Object.entries(FIELD_TO_DIMENSION)
        .filter(([, mapped]) => mapped === dimension)
        .map(([column]) => column);
}

function DimensionCard({ dimension, fromSheet }: { dimension: string; fromSheet: boolean }) {
    const { values, descriptions, valueDescriptions, addValue, removeValue, setDescription, setValueDescription } =
        useEnumRegistry();
    const [draft, setDraft] = useState("");
    const [expanded, setExpanded] = useState(false);

    const list = values[dimension] ?? [];
    const columns = columnsUsing(dimension);

    const submit = () => {
        addValue(dimension, draft);
        setDraft("");
    };

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {dimension}
                    </Typography>
                    <Chip
                        size="small"
                        label={fromSheet ? "из таблицы Enums" : "своё значение"}
                        color={fromSheet ? "success" : "default"}
                        variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                        значений: {list.length}
                    </Typography>
                </Stack>

                <TextField
                    size="small"
                    fullWidth
                    label="Пояснение (показывается подсказкой на выпадающем списке)"
                    value={descriptions[dimension] ?? ""}
                    onChange={(event) => setDescription(dimension, event.target.value)}
                />

                {columns.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                        Используется в колонках: {columns.join(", ")}
                    </Typography>
                )}

                {!expanded ? (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {list.map((value) => (
                            <Chip key={value} size="small" label={value} onDelete={() => removeValue(dimension, value)} />
                        ))}
                        {list.length > 0 && (
                            <Chip size="small" variant="outlined" label="Описания значений…" onClick={() => setExpanded(true)} />
                        )}
                    </Box>
                ) : (
                    <Stack spacing={0.5}>
                        {list.map((value) => (
                            <Stack key={value} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                <Typography variant="body2" sx={{ minWidth: 130, flexShrink: 0 }} noWrap title={value}>
                                    {value}
                                </Typography>
                                <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="что значит это значение"
                                    value={valueDescriptions[dimension]?.[value] ?? ""}
                                    onChange={(event) => setValueDescription(dimension, value, event.target.value)}
                                />
                                <Tooltip title="Убрать значение">
                                    <IconButton size="small" onClick={() => removeValue(dimension, value)}>
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        ))}
                        <Box>
                            <Chip size="small" variant="outlined" label="Свернуть" onClick={() => setExpanded(false)} />
                        </Box>
                    </Stack>
                )}

                <Stack direction="row" spacing={1}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Добавить значение"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                    <IconButton size="small" onClick={submit} disabled={!draft.trim()}>
                        <AddIcon fontSize="small" />
                    </IconButton>
                </Stack>
            </Stack>
        </Paper>
    );
}

export default function EnumsPage() {
    const store = useStore();
    const { values, sheetBackedDimensions } = useEnumRegistry();

    const dimensions = Object.keys(values).sort((a, b) => a.localeCompare(b));
    const sheetCount = sheetBackedDimensions.size;

    return (
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
            <Typography variant="h4">Enums</Typography>

            <Typography variant="body2" color="text.secondary">
                Допустимые значения параметров — то, из чего состоят выпадающие списки в карточках предметов и
                механик. Берутся из вкладки <code>Enums</code> вашей таблицы конфигурации, поэтому список сам
                обновляется после «Скачать конфиг» — ничего не зашито в коде.
            </Typography>

            {sheetCount === 0 ? (
                <Alert severity="warning">
                    Вкладка <code>Enums</code> ещё не загружена, показаны встроенные значения по умолчанию. Скачайте
                    конфиг на странице «Источники», чтобы списки соответствовали таблице.
                </Alert>
            ) : (
                <Alert severity="info">
                    Из таблицы загружено измерений: {sheetCount}. Остальные — встроенные: их нет во вкладке{" "}
                    <code>Enums</code> (например <code>ItemMech</code>/<code>TagMech</code>/<code>TargetGetter</code> —
                    их значения взяты из самих таблиц механик).
                </Alert>
            )}

            <Typography variant="caption" color="text.secondary">
                Добавленные и убранные здесь значения живут только в этой вкладке браузера и в таблицу не
                выгружаются — правьте вкладку <code>Enums</code>, если значение нужно всем.
                {store.importedAt ? ` Конфиг загружен: ${new Date(store.importedAt).toLocaleString()}.` : ""}
            </Typography>

            <Stack spacing={2}>
                {dimensions.map((dimension) => (
                    <DimensionCard
                        key={dimension}
                        dimension={dimension}
                        fromSheet={sheetBackedDimensions.has(dimension)}
                    />
                ))}
            </Stack>
        </Stack>
    );
}
