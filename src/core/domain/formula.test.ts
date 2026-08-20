import { describe, expect, it } from "vitest";
import { evaluateFormula, validateFormula } from "./formula";

const vars = { prev: 10, base: 4, tier: 2, min: 10, max: 10, money: 3, overheat: 0 };

function value(source: string): number {
    const result = evaluateFormula(source, vars);
    if (!result.ok) throw new Error(`expected success, got: ${result.error}`);
    return result.value;
}

function error(source: string): string {
    const result = evaluateFormula(source, vars);
    if (result.ok) throw new Error(`expected failure, got: ${result.value}`);
    return result.error;
}

describe("formula arithmetic", () => {
    it("does the thing the existing data does — doubling each tier", () => {
        expect(value("prev * 2")).toBe(20);
    });

    it("respects precedence and parentheses", () => {
        expect(value("2 + 3 * 4")).toBe(14);
        expect(value("(2 + 3) * 4")).toBe(20);
    });

    it("treats ^ as right-associative, like a maths notation reader expects", () => {
        expect(value("2 ^ 3 ^ 2")).toBe(512);
    });

    it("handles unary minus, including in front of a variable", () => {
        expect(value("-prev")).toBe(-10);
        expect(value("3 - -2")).toBe(5);
    });

    it("reads decimals", () => {
        expect(value("prev * 1.5")).toBe(15);
    });

    it("exposes every parameter of the previous tier, not just prev", () => {
        expect(value("min + max + money")).toBe(23);
        expect(value("base * tier")).toBe(8);
    });
});

describe("formula functions", () => {
    it("rounds, floors and ceils", () => {
        expect(value("round(prev * 1.25)")).toBe(13);
        expect(value("floor(prev * 1.29)")).toBe(12);
        expect(value("ceil(prev * 1.01)")).toBe(11);
    });

    it("takes min/max of several arguments and clamps", () => {
        expect(value("max(prev, 25)")).toBe(25);
        expect(value("min(prev, 3, 7)")).toBe(3);
        expect(value("clamp(prev * 10, 0, 50)")).toBe(50);
    });

    it("rejects a wrong argument count instead of silently using NaN", () => {
        expect(error("clamp(1, 2)")).toContain("ждёт 3");
    });

    it("names the unknown function", () => {
        expect(error("sqrt(prev)")).toContain("sqrt");
    });
});

describe("formula errors are readable", () => {
    it("names an unknown variable and lists what does exist", () => {
        const message = error("prevv * 2");
        expect(message).toContain("prevv");
        expect(message).toContain("prev");
    });

    it("catches an unclosed bracket", () => {
        expect(error("(prev * 2")).toContain("скобка");
    });

    it("catches trailing junk rather than quietly ignoring it", () => {
        expect(error("prev 2")).toContain("лишнее");
    });

    it("refuses division by zero", () => {
        expect(error("prev / 0")).toContain("ноль");
    });

    it("refuses an empty formula", () => {
        expect(error("   ")).toContain("пустая");
    });

    it("never throws, whatever is typed", () => {
        for (const source of ["", "((", "*", "1 +", "@@@", "round(", "a b c", ",", "1..2.3"]) {
            expect(() => evaluateFormula(source, vars)).not.toThrow();
            expect(evaluateFormula(source, vars).ok).toBe(false);
        }
    });
});

describe("validateFormula", () => {
    it("passes a formula that only uses declared variables", () => {
        expect(validateFormula("prev * 2 + base", ["prev", "base"])).toBeNull();
    });

    it("reports one that doesn't, before any item is touched", () => {
        expect(validateFormula("prev * money", ["prev"])).toContain("money");
    });

    it("does not report division by a variable, which may well be non-zero in real data", () => {
        expect(validateFormula("prev / base", ["prev", "base"])).toBeNull();
    });
});
