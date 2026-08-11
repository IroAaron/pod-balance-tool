import { useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import {
    compareBySeverity,
    parseTestRunReport,
    type Finding,
    type StoredTestRun,
} from "../../../core/models/TestRun";
import { addTestRun, loadTestRuns, removeTestRun } from "../../../core/persistence/autotestsStore";

/** Статус прогона всегда показывается иконкой + словом, а не одним цветом:
 *  цвет не читается при дальтонизме и теряется в ч/б печати. */
const STATUS_VIEW = {
    healthy: { label: "Всё зелёное", color: "success" as const, Icon: CheckCircleOutlinedIcon },
    attention: { label: "Падает только известное", color: "warning" as const, Icon: WarningAmberIcon },
    broken: { label: "Есть новые падения", color: "error" as const, Icon: ErrorOutlinedIcon },
};

/** Ссылки на репозиторий с тестами. Прогон запускается на стороне GitHub Actions:
 *  сайт статический и сам ничего запустить не может, а pod-autotests приватный —
 *  любой запрос к нему требовал бы токена. Токен в публичной странице недопустим,
 *  поэтому здесь именно ссылка, а не автоматический запуск. */
const AUTOTESTS_REPO = "https://github.com/IroAaron/pod-autotests";
const RUN_WORKFLOW_URL = `${AUTOTESTS_REPO}/actions/workflows/tests.yml`;

const SEVERITY_COLOR: Record<string, "error" | "warning" | "info" | "default"> = {
    critical: "error",
    high: "error",
    medium: "warning",
    low: "default",
};

const CATEGORY_LABEL: Record<string, string> = {
    regression: "новое падение",
    known_issue: "известное",
    infrastructure: "инфраструктура",
    performance: "производительность",
    observation: "наблюдение",
};

function statusView(status: string) {
    return STATUS_VIEW[status as keyof typeof STATUS_VIEW] ?? STATUS_VIEW.attention;
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)} с`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} мин ${Math.round(seconds % 60)} с`;
}

/** Сводный показатель. Намеренно не график: одно число читается быстрее любой
 *  диаграммы, а сравнивать тут нечего. */
function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <Paper variant="outlined" sx={{ p: 2, minWidth: 140, flex: "1 1 140px" }}>
            <Typography variant="caption" color="text.secondary">
                {label}
            </Typography>
            <Typography variant="h4" sx={{ lineHeight: 1.2 }}>
                {value}
            </Typography>
            {hint ? (
                <Typography variant="caption" color="text.secondary">
                    {hint}
                </Typography>
            ) : null}
        </Paper>
    );
}

function FindingRow({ finding }: { finding: Finding }) {
    return (
        <TableRow>
            <TableCell sx={{ verticalAlign: "top" }}>
                <Chip
                    size="small"
                    label={finding.severity}
                    color={SEVERITY_COLOR[finding.severity] ?? "default"}
                    variant={finding.severity === "low" ? "outlined" : "filled"}
                />
            </TableCell>
            <TableCell sx={{ verticalAlign: "top" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {finding.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                    {finding.test}
                </Typography>
                {finding.what_happened ? (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}
                    >
                        {finding.what_happened}
                    </Typography>
                ) : null}
                {finding.recommended_action ? (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                        <strong>Что сделать:</strong> {finding.recommended_action}
                    </Typography>
                ) : null}
            </TableCell>
            <TableCell sx={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
                {CATEGORY_LABEL[finding.category] ?? finding.category}
            </TableCell>
            <TableCell sx={{ verticalAlign: "top", whiteSpace: "nowrap" }}>{finding.owner}</TableCell>
        </TableRow>
    );
}

export default function AutotestsPage() {
    const [runs, setRuns] = useState<StoredTestRun[]>(() => loadTestRuns());
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const current = useMemo(() => {
        if (runs.length === 0) return null;
        return runs.find((run) => run.id === selectedId) ?? runs[0];
    }, [runs, selectedId]);

    const sortedFindings = useMemo(() => {
        if (!current) return [];
        return [...current.analysis.findings].sort(compareBySeverity);
    }, [current]);

    async function handleFiles(fileList: FileList | null) {
        if (!fileList || fileList.length === 0) return;
        setError(null);

        try {
            for (const file of Array.from(fileList)) {
                const text = await file.text();
                const report = parseTestRunReport(JSON.parse(text));
                setRuns(addTestRun(report, file.name));
            }
            setSelectedId(null);
        } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : String(parseError));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    }

    const view = current ? statusView(current.analysis.overall_status) : null;

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 1 }}>
                Автотесты
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Разбор прогонов из <code>pod-autotests</code>. Прогон запускается на GitHub,
                результат загружается сюда файлом <code>triage.json</code> — сайт статический
                и сам тесты выполнить не может.
            </Typography>

            <Stack direction="row" sx={{ gap: 1, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
                <Button variant="contained" onClick={() => fileInputRef.current?.click()}>
                    Загрузить triage.json
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    multiple
                    hidden
                    onChange={(event) => void handleFiles(event.target.files)}
                />
                <Button
                    variant="outlined"
                    component="a"
                    href={RUN_WORKFLOW_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Запустить прогон на GitHub
                </Button>
                {runs.length > 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        Сохранено прогонов: {runs.length}
                    </Typography>
                ) : null}
            </Stack>

            {error ? (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            ) : null}

            {!current ? (
                <Alert severity="info">
                    Прогонов пока нет. Как получить отчёт:
                    <Box component="ol" sx={{ pl: 3, mt: 1, mb: 0 }}>
                        <li>
                            Нажмите «Запустить прогон на GitHub» — откроется вкладка Actions.
                            Там <strong>Run workflow</strong> → ветка <code>main</code> → зелёная кнопка.
                        </li>
                        <li>Дождитесь окончания (быстрые тесты ~2 минуты, сцены дольше).</li>
                        <li>
                            Внизу страницы прогона, в разделе <strong>Artifacts</strong>, скачайте{" "}
                            <code>triage-fast</code> или <code>triage-scenes</code> и распакуйте.
                        </li>
                        <li>Загрузите оттуда <code>triage.json</code> кнопкой слева.</li>
                    </Box>
                    Локально то же самое даёт{" "}
                    <code>python3 scripts/analyze/triage.py reports/report_1/results.xml</code>.
                </Alert>
            ) : (
                <>
                    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                        <Stack direction="row" sx={{ gap: 1, alignItems: "center", mb: 1.5 }}>
                            {view ? <view.Icon color={view.color} /> : null}
                            <Typography variant="h6">{view?.label}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                · {current.digest.report} · загружен{" "}
                                {new Date(current.uploadedAt).toLocaleString("ru-RU")}
                            </Typography>
                        </Stack>

                        <Typography variant="body1" sx={{ mb: 2 }}>
                            {current.analysis.summary}
                        </Typography>

                        <Stack direction="row" sx={{ gap: 1.5, flexWrap: "wrap" }}>
                            <StatTile label="Тестов" value={String(current.digest.totals.tests)} />
                            <StatTile
                                label="Падений"
                                value={String(current.digest.totals.failures)}
                                hint={current.digest.totals.errors > 0 ? `ошибок: ${current.digest.totals.errors}` : undefined}
                            />
                            <StatTile
                                label="Новых падений"
                                value={String(
                                    current.analysis.findings.filter((f) => f.category === "regression").length,
                                )}
                                hint="не в known_issues.json"
                            />
                            <StatTile
                                label="Время"
                                value={formatDuration(current.digest.totals.duration_sec)}
                            />
                        </Stack>
                    </Paper>

                    {sortedFindings.length > 0 ? (
                        <Paper variant="outlined" sx={{ mb: 2 }}>
                            <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
                                Находки
                            </Typography>
                            <Box sx={{ overflowX: "auto" }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Важность</TableCell>
                                            <TableCell>Что</TableCell>
                                            <TableCell>Категория</TableCell>
                                            <TableCell>Кому</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {sortedFindings.map((finding, index) => (
                                            <FindingRow key={`${finding.test}-${index}`} finding={finding} />
                                        ))}
                                    </TableBody>
                                </Table>
                            </Box>
                        </Paper>
                    ) : null}

                    {current.analysis.notes.length > 0 ? (
                        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                Прочие наблюдения
                            </Typography>
                            <Stack component="ul" sx={{ gap: 0.5, pl: 3, m: 0 }}>
                                {current.analysis.notes.map((note, index) => (
                                    <Typography component="li" variant="body2" key={index}>
                                        {note}
                                    </Typography>
                                ))}
                            </Stack>
                        </Paper>
                    ) : null}

                    <Paper variant="outlined">
                        <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
                            История прогонов
                        </Typography>
                        <Divider />
                        <Box sx={{ overflowX: "auto" }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Статус</TableCell>
                                        <TableCell>Прогон</TableCell>
                                        <TableCell align="right">Тестов</TableCell>
                                        <TableCell align="right">Падений</TableCell>
                                        <TableCell align="right">Время</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {runs.map((run) => {
                                        const runView = statusView(run.analysis.overall_status);
                                        const isCurrent = run.id === current.id;
                                        return (
                                            <TableRow
                                                key={run.id}
                                                hover
                                                selected={isCurrent}
                                                sx={{ cursor: "pointer" }}
                                                onClick={() => setSelectedId(run.id)}
                                            >
                                                <TableCell sx={{ whiteSpace: "nowrap" }}>
                                                    <Chip
                                                        size="small"
                                                        icon={<runView.Icon />}
                                                        label={runView.label}
                                                        color={runView.color}
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {run.digest.report}
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                                        {new Date(run.uploadedAt).toLocaleString("ru-RU")}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">{run.digest.totals.tests}</TableCell>
                                                <TableCell align="right">{run.digest.totals.failures}</TableCell>
                                                <TableCell align="right">
                                                    {formatDuration(run.digest.totals.duration_sec)}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Tooltip title="Удалить прогон">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                setRuns(removeTestRun(run.id));
                                                            }}
                                                        >
                                                            <DeleteOutlinedIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </Box>
                    </Paper>
                </>
            )}
        </Box>
    );
}
