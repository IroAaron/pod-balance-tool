/**
 * A very small arithmetic expression language, used by the upgrade-tier formulas on the «Значения» page
 * (`prev * 2`, `round(prev * 1.5)`, `min + money`, ...).
 *
 * It's a hand-written parser rather than `new Function`/eval on purpose: the formula is typed into a field and
 * then run once per affected item, so a typo has to come back as a readable message pointing at the problem
 * ("неизвестная переменная «prevv»") instead of a thrown ReferenceError or, worse, arbitrary code reaching the
 * page's scope. It also keeps the whole thing testable without a DOM.
 *
 * Grammar (lowest precedence first):
 *   expression := term (("+" | "-") term)*
 *   term       := power (("*" | "/" | "%") power)*
 *   power      := unary ("^" power)?          — right-associative, so 2^3^2 is 2^(3^2)
 *   unary      := ("-" | "+")? primary
 *   primary    := number | identifier | call | "(" expression ")"
 *   call       := identifier "(" (expression ("," expression)*)? ")"
 */

export interface FormulaFunction {
    arity: number | "variadic";
    apply: (args: number[]) => number;
}

export const FORMULA_FUNCTIONS: Record<string, FormulaFunction> = {
    round: { arity: 1, apply: ([value]) => Math.round(value) },
    floor: { arity: 1, apply: ([value]) => Math.floor(value) },
    ceil: { arity: 1, apply: ([value]) => Math.ceil(value) },
    abs: { arity: 1, apply: ([value]) => Math.abs(value) },
    min: { arity: "variadic", apply: (args) => Math.min(...args) },
    max: { arity: "variadic", apply: (args) => Math.max(...args) },
    clamp: { arity: 3, apply: ([value, low, high]) => Math.min(Math.max(value, low), high) },
};

type Token =
    | { kind: "number"; value: number }
    | { kind: "name"; value: string }
    | { kind: "op"; value: string };

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;

    while (index < source.length) {
        const char = source[index];

        if (/\s/.test(char)) {
            index++;
            continue;
        }

        if (/[0-9.]/.test(char)) {
            let end = index;
            while (end < source.length && /[0-9.]/.test(source[end])) end++;
            const text = source.slice(index, end);
            const value = Number(text);
            if (!Number.isFinite(value)) throw new Error(`не число: «${text}»`);
            tokens.push({ kind: "number", value });
            index = end;
            continue;
        }

        if (/[A-Za-z_]/.test(char)) {
            let end = index;
            while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end++;
            tokens.push({ kind: "name", value: source.slice(index, end) });
            index = end;
            continue;
        }

        if ("+-*/%^(),".includes(char)) {
            tokens.push({ kind: "op", value: char });
            index++;
            continue;
        }

        throw new Error(`непонятный символ «${char}»`);
    }

    return tokens;
}

class Parser {
    private position = 0;
    private readonly tokens: Token[];
    private readonly variables: Record<string, number>;

    constructor(tokens: Token[], variables: Record<string, number>) {
        this.tokens = tokens;
        this.variables = variables;
    }

    parse(): number {
        const value = this.expression();
        if (this.position < this.tokens.length) {
            const leftover = this.tokens[this.position];
            throw new Error(`лишнее в конце: «${"value" in leftover ? leftover.value : "?"}»`);
        }
        return value;
    }

    private peek(): Token | undefined {
        return this.tokens[this.position];
    }

    private eatOperator(...candidates: string[]): string | null {
        const token = this.peek();
        if (token?.kind === "op" && candidates.includes(token.value)) {
            this.position++;
            return token.value;
        }
        return null;
    }

    private expression(): number {
        let left = this.term();
        for (;;) {
            const operator = this.eatOperator("+", "-");
            if (!operator) return left;
            const right = this.term();
            left = operator === "+" ? left + right : left - right;
        }
    }

    private term(): number {
        let left = this.power();
        for (;;) {
            const operator = this.eatOperator("*", "/", "%");
            if (!operator) return left;
            const right = this.power();
            if ((operator === "/" || operator === "%") && right === 0) throw new Error("деление на ноль");
            if (operator === "*") left = left * right;
            else if (operator === "/") left = left / right;
            else left = left % right;
        }
    }

    private power(): number {
        const base = this.unary();
        if (!this.eatOperator("^")) return base;
        // Right-associative: the exponent is itself a power expression.
        return base ** this.power();
    }

    private unary(): number {
        const sign = this.eatOperator("-", "+");
        const value = this.primary();
        return sign === "-" ? -value : value;
    }

    private primary(): number {
        const token = this.peek();
        if (!token) throw new Error("формула обрывается");

        if (token.kind === "number") {
            this.position++;
            return token.value;
        }

        if (token.kind === "name") {
            this.position++;
            const next = this.peek();
            if (next?.kind === "op" && next.value === "(") return this.call(token.value);

            if (!(token.value in this.variables)) {
                const known = Object.keys(this.variables).join(", ");
                throw new Error(`неизвестная переменная «${token.value}» (есть: ${known})`);
            }
            return this.variables[token.value];
        }

        if (token.value === "(") {
            this.position++;
            const value = this.expression();
            if (!this.eatOperator(")")) throw new Error("не закрыта скобка");
            return value;
        }

        throw new Error(`не на месте: «${token.value}»`);
    }

    private call(name: string): number {
        const fn = FORMULA_FUNCTIONS[name];
        if (!fn) {
            throw new Error(`нет такой функции «${name}» (есть: ${Object.keys(FORMULA_FUNCTIONS).join(", ")})`);
        }

        this.eatOperator("(");
        const args: number[] = [];
        if (!this.eatOperator(")")) {
            do {
                args.push(this.expression());
            } while (this.eatOperator(","));
            if (!this.eatOperator(")")) throw new Error(`не закрыта скобка у «${name}»`);
        }

        if (fn.arity !== "variadic" && args.length !== fn.arity) {
            throw new Error(`«${name}» ждёт ${fn.arity} аргумент(а), а получила ${args.length}`);
        }
        if (fn.arity === "variadic" && args.length === 0) {
            throw new Error(`«${name}» ждёт хотя бы один аргумент`);
        }

        return fn.apply(args);
    }
}

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

/** Runs `source` against `variables`. Never throws — a bad formula comes back as `{ ok: false }` with a reason. */
export function evaluateFormula(source: string, variables: Record<string, number>): FormulaResult {
    const trimmed = source.trim();
    if (!trimmed) return { ok: false, error: "пустая формула" };

    try {
        const value = new Parser(tokenize(trimmed), variables).parse();
        if (!Number.isFinite(value)) return { ok: false, error: "получилось не число" };
        return { ok: true, value };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Checks a formula once, against the variable *names* it will be given, without needing real data — so the
 * field can show "неизвестная переменная" as it's typed rather than only when applied to 200 items.
 */
export function validateFormula(source: string, variableNames: string[]): string | null {
    const probe = Object.fromEntries(variableNames.map((name) => [name, 1]));
    const result = evaluateFormula(source, probe);
    return result.ok ? null : result.error;
}
