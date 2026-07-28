import { describe, expect, it } from "vitest";
import { computeItemPowers, moneyValueOf, averageValueOf } from "./balance";
import type { Item } from "../models/Item";
import type { MechanicRow } from "../models/Mechanic";
import type { Build } from "../models/Build";
import type { BalanceConfig } from "../models/BalanceConfig";

function makeItem(id: string, overrides: Partial<Item> = {}): Item {
    return { id, tags: [], raw: {}, nameKey: id, ...overrides };
}

describe("moneyValueOf / averageValueOf", () => {
    it("reads MoneyValue from item.raw and defaults missing/blank to 0", () => {
        expect(moneyValueOf(makeItem("a", { raw: { MoneyValue: "12" } }))).toBe(12);
        expect(moneyValueOf(makeItem("b"))).toBe(0);
        expect(moneyValueOf(makeItem("c", { raw: { MoneyValue: "1,5" } }))).toBe(1.5);
    });

    it("averages ValueMin/ValueMax, defaulting a missing bound to 0", () => {
        expect(averageValueOf(makeItem("a", { valueMin: 2, valueMax: 6 }))).toBe(4);
        expect(averageValueOf(makeItem("b"))).toBe(0);
    });
});

describe("computeItemPowers", () => {
    it("sums the build's own depth coefficient into a member's power, per the documented formula", () => {
        const root = makeItem("root", {
            valueMin: 2,
            valueMax: 6,
            raw: { MoneyValue: "10" },
        });
        const booster = makeItem("booster", {
            tags: ["Boost"],
            valueMin: 1,
            valueMax: 3,
            raw: { MoneyValue: "5" },
        });
        const unrelated = makeItem("unrelated", { valueMin: 9, valueMax: 9 });

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: {
                TargetType: "PlayerScore",
                TargetValueType: "MainValue",
                ActivatorType: "BallPass",
                ActivatorTag: "Boost",
            },
        };

        const build: Build = { id: "build-1", name: "Test Build", items: ["root", "booster", "unrelated"] };
        const balanceConfig: BalanceConfig = {
            depthCoefficients: { 0: 1, 1: 2 },
            scaleChelAppearanceProbability: 0.5,
        };

        const powers = computeItemPowers([root, booster, unrelated], [build], [payoff], [], [], balanceConfig);

        const rootPower = powers.get("root")!;
        expect(rootPower.moneyValue).toBe(10);
        expect(rootPower.averageValue).toBe(4);
        // root IS a build root, so P auto-computes as the sum of its scalers' shop probability — no
        // shopAppearances passed here, so that sum is 0 (real root, just no shop data), NOT the 0.5 fallback.
        expect(rootPower.probabilityIsAuto).toBe(true);
        expect(rootPower.probabilityTerm).toBeCloseTo(4); // 4 * (1 + 0)
        expect(rootPower.buildPresence).toEqual([{ buildId: "build-1", buildName: "Test Build", depth: 0, coefficient: 1 }]);
        expect(rootPower.buildTerm).toBeCloseTo(4); // 4 * 1
        expect(rootPower.power).toBeCloseTo(22); // (10 + 4) + 4 + 4

        const boosterPower = powers.get("booster")!;
        expect(boosterPower.buildPresence).toEqual([{ buildId: "build-1", buildName: "Test Build", depth: 1, coefficient: 2 }]);
        expect(boosterPower.buildTerm).toBeCloseTo(4); // 2 * 2
        expect(boosterPower.power).toBeCloseTo(14); // (5 + 2) + 3 + 4

        // A build member with no real structural path to the root (computeCascadeLevels' `unclassified`) has no
        // "ступень" to look up a coefficient for — contributes nothing to the sum, not a fallback depth-0 credit.
        const unrelatedPower = powers.get("unrelated")!;
        expect(unrelatedPower.buildPresence).toEqual([]);
        expect(unrelatedPower.buildCoefficientSum).toBe(0);
        expect(unrelatedPower.power).toBeCloseTo(22.5); // MoneyValue(0) + avg(9) + avg*(1+0.5)=13.5, no build term
    });

    it("sums coefficients across every build an item is classified into", () => {
        const root = makeItem("root", { valueMin: 1, valueMax: 1, raw: { MoneyValue: "0" } });
        const shared = makeItem("shared", { tags: ["Boost"], valueMin: 2, valueMax: 2 });

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };
        const rootB = makeItem("rootB", { valueMin: 1, valueMax: 1 });
        const payoffB: MechanicRow = {
            id: "rootB-payoff",
            table: "MechAddValue",
            itemId: "rootB",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };

        const buildA: Build = { id: "build-a", name: "A", items: ["root", "shared"] };
        const buildB: Build = { id: "build-b", name: "B", items: ["rootB", "shared"] };
        const balanceConfig: BalanceConfig = { depthCoefficients: { 0: 0, 1: 3 }, scaleChelAppearanceProbability: 0 };

        const powers = computeItemPowers(
            [root, rootB, shared],
            [buildA, buildB],
            [payoff, payoffB],
            [],
            [],
            balanceConfig
        );

        const sharedPower = powers.get("shared")!;
        expect(sharedPower.buildPresence).toHaveLength(2);
        expect(sharedPower.buildCoefficientSum).toBe(6); // depth 1 in both builds: 3 + 3
    });

    it("P is the sum of a root item's own scalers' shop-appearance probability, not the root's own", () => {
        const root = makeItem("root", { valueMin: 2, valueMax: 6, raw: { MoneyValue: "0" } });
        const scaler = makeItem("scaler", { tags: ["Boost"], valueMin: 0, valueMax: 0 });
        const neverRoot = makeItem("never-root", { valueMin: 4, valueMax: 4 }); // not a member of any build

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };
        const build: Build = { id: "build-1", name: "Root Build", items: ["root", "scaler"] };
        const balanceConfig: BalanceConfig = { depthCoefficients: { 0: 0, 1: 0 }, scaleChelAppearanceProbability: 0.1 };

        // scaler's OWN shop probability (root itself has none in this map — the root's own appearance is
        // irrelevant to its P, only its scaler's is).
        const shopAppearances = new Map([
            ["scaler", { itemId: "scaler", packs: [], perSlotProbability: 0.2, perVisitProbability: 0.4 }],
        ]);

        const powers = computeItemPowers([root, scaler, neverRoot], [build], [payoff], [], [], balanceConfig, shopAppearances);

        const rootPower = powers.get("root")!;
        expect(rootPower.probabilityIsAuto).toBe(true);
        expect(rootPower.probability).toBeCloseTo(0.4);
        expect(rootPower.probabilitySources).toEqual([
            { itemId: "scaler", buildId: "build-1", buildName: "Root Build", probability: 0.4 },
        ]);

        // Never the root of any build → falls back to the manual constant, not 0.
        const neverRootPower = powers.get("never-root")!;
        expect(neverRootPower.probabilityIsAuto).toBe(false);
        expect(neverRootPower.probability).toBeCloseTo(0.1);
        expect(neverRootPower.probabilitySources).toEqual([]);
    });

    it("a real root with a scaler that has no known shop data still counts as auto (P=0), not the manual fallback", () => {
        const root = makeItem("root", { valueMin: 2, valueMax: 6, raw: { MoneyValue: "0" } });
        const scaler = makeItem("scaler", { tags: ["Boost"], valueMin: 0, valueMax: 0 });

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };
        const build: Build = { id: "build-1", name: "Root Build", items: ["root", "scaler"] };
        const balanceConfig: BalanceConfig = { depthCoefficients: { 0: 0, 1: 0 }, scaleChelAppearanceProbability: 0.9 };

        // No shopAppearances passed at all this time.
        const powers = computeItemPowers([root, scaler], [build], [payoff], [], [], balanceConfig);

        const rootPower = powers.get("root")!;
        expect(rootPower.probabilityIsAuto).toBe(true);
        expect(rootPower.probability).toBe(0); // real root, just no scaler shop data — not the 0.9 fallback
    });
});
