/** Разбор прогона автотестов из pod-autotests.
 *
 *  Схема повторяет triage.json, который пишет scripts/analyze/triage.py.
 *  Тот же формат отдаёт и разбор моделью (analyze_report.py) — оба гонят вывод
 *  через общий рендер, поэтому здесь достаточно одного набора типов.
 */

export type OverallStatus = "healthy" | "attention" | "broken";

export type FindingCategory =
    | "regression"
    | "known_issue"
    | "infrastructure"
    | "performance"
    | "observation";

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export interface TestRunTotals {
    tests: number;

    failures: number;

    errors: number;

    skipped: number;

    flaky: number;

    duration_sec: number;
}

export interface FailingCase {
    test: string;

    /** Категория теста — она же путь набора: tests/mechanics, tests/scenes и т.д. */
    category: string;

    status: string;

    message: string;

    details: string;
}

export interface TestRunDigest {
    report: string;

    totals: TestRunTotals;

    failing: FailingCase[];

    slowest: { test: string; time_sec: number }[];

    passed: string[];

    /** Категория каждого теста, включая пройденные. */
    test_packages?: Record<string, string>;
}

export interface Finding {
    test: string;

    category: FindingCategory | string;

    severity: FindingSeverity | string;

    title: string;

    what_happened: string;

    likely_cause: string;

    recommended_action: string;

    owner: string;
}

export interface TestRunAnalysis {
    overall_status: OverallStatus | string;

    summary: string;

    findings: Finding[];

    notes: string[];
}

/** Содержимое файла triage.json как есть. */
export interface TestRunReport {
    digest: TestRunDigest;

    analysis: TestRunAnalysis;
}

/** Загруженный прогон: отчёт плюс то, что нужно самому дашборду. */
export interface StoredTestRun extends TestRunReport {
    /** Стабильный идентификатор, чтобы один и тот же файл не задваивался. */
    id: string;

    /** Когда файл загрузили на сайт (у самого отчёта своей даты нет). */
    uploadedAt: string;

    fileName: string;
}

const SEVERITY_ORDER: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};

export function compareBySeverity(a: Finding, b: Finding): number {
    const left = SEVERITY_ORDER[a.severity] ?? 9;
    const right = SEVERITY_ORDER[b.severity] ?? 9;
    return left - right;
}

/** Проверка формы загруженного файла.
 *
 *  Нужна потому, что файл выбирает человек руками: без неё случайный JSON
 *  (например, analysis.json от другого инструмента или просто не тот файл)
 *  прошёл бы дальше и упал бы уже в рендере с невнятной ошибкой.
 */
export function parseTestRunReport(raw: unknown): TestRunReport {
    if (typeof raw !== "object" || raw === null) {
        throw new Error("Файл не содержит JSON-объект");
    }

    const candidate = raw as Partial<TestRunReport>;
    const digest = candidate.digest;
    const analysis = candidate.analysis;

    if (typeof digest !== "object" || digest === null || typeof digest.totals !== "object") {
        throw new Error("Нет секции digest.totals — это точно triage.json из pod-autotests?");
    }
    if (typeof analysis !== "object" || analysis === null || !Array.isArray(analysis.findings)) {
        throw new Error("Нет секции analysis.findings — это точно triage.json из pod-autotests?");
    }

    return {
        digest: {
            report: digest.report ?? "без имени",
            totals: {
                tests: digest.totals.tests ?? 0,
                failures: digest.totals.failures ?? 0,
                errors: digest.totals.errors ?? 0,
                skipped: digest.totals.skipped ?? 0,
                flaky: digest.totals.flaky ?? 0,
                duration_sec: digest.totals.duration_sec ?? 0,
            },
            failing: digest.failing ?? [],
            slowest: digest.slowest ?? [],
            passed: digest.passed ?? [],
            test_packages: digest.test_packages,
        },
        analysis: {
            overall_status: analysis.overall_status ?? "attention",
            summary: analysis.summary ?? "",
            findings: analysis.findings,
            notes: analysis.notes ?? [],
        },
    };
}
