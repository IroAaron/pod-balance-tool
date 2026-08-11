import type { StoredTestRun, TestRunReport } from "../models/TestRun";

/** Хранилище загруженных прогонов автотестов.
 *
 *  Почему localStorage, а не бэкенд: сайт статический (GitHub Pages), своего
 *  сервера нет, а отчёты живут в артефактах приватного CI и публично недоступны.
 *  Тот же подход, что и у остальных данных сайта — загрузка файла руками
 *  плюс localStorage, см. «Источники».
 */

const KEY = "pod-balance-tool:v1:autotestRuns";

/** Ограничение истории: прогоны лежат целиком, вместе с текстами падений,
 *  а квота localStorage — единицы мегабайт на весь сайт. Без потолка история
 *  однажды вытеснила бы билды и иконки, и пользователь потерял бы свою работу
 *  ради отчётов, которые всегда можно загрузить заново. */
const MAX_RUNS = 30;

export function loadTestRuns(): StoredTestRun[] {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed as StoredTestRun[];
    } catch {
        // Битые данные не должны ронять страницу: отчёты восстановимы, история — нет.
        return [];
    }
}

function persist(runs: StoredTestRun[]): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(runs));
    } catch (error) {
        throw new Error(
            "Не удалось сохранить прогон — вероятно, кончилось место в localStorage. " +
                "Удалите старые прогоны на странице «Автотесты».",
            { cause: error },
        );
    }
}

/** Ключ, по которому один и тот же отчёт не задваивается при повторной загрузке.
 *  Берём имя прогона и итоги: у самого отчёта нет ни идентификатора, ни времени. */
function runIdentity(report: TestRunReport): string {
    const { report: name, totals } = report.digest;
    return [name, totals.tests, totals.failures, totals.errors, totals.duration_sec].join("|");
}

export function addTestRun(report: TestRunReport, fileName: string): StoredTestRun[] {
    const runs = loadTestRuns();
    const identity = runIdentity(report);

    const stored: StoredTestRun = {
        ...report,
        id: identity,
        uploadedAt: new Date().toISOString(),
        fileName,
    };

    // Повторная загрузка того же отчёта заменяет запись, а не плодит дубли:
    // иначе история засоряется одинаковыми прогонами и тренд врёт.
    const withoutDuplicate = runs.filter((run) => run.id !== identity);
    const next = [stored, ...withoutDuplicate].slice(0, MAX_RUNS);

    persist(next);
    return next;
}

export function removeTestRun(id: string): StoredTestRun[] {
    const next = loadTestRuns().filter((run) => run.id !== id);
    persist(next);
    return next;
}

export function clearTestRuns(): void {
    localStorage.removeItem(KEY);
}
