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
            mechanicInfluence: {},
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
        const balanceConfig: BalanceConfig = { depthCoefficients: { 0: 0, 1: 3 }, scaleChelAppearanceProbability: 0, mechanicInfluence: {} };

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
        const balanceConfig: BalanceConfig = { depthCoefficients: { 0: 0, 1: 0 }, scaleChelAppearanceProbability: 0.1, mechanicInfluence: {} };

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

    it("P only sums DIRECT scalers (depth exactly 1) — a depth-2 (indirect) scaler's shop probability is excluded", () => {
        const root = makeItem("root", { valueMin: 1, valueMax: 1, raw: {} });
        const directScaler = makeItem("direct-scaler", { tags: ["Boost"], valueMin: 0, valueMax: 0 });
        const indirectScaler = makeItem("indirect-scaler", { tags: ["Fuel"], valueMin: 0, valueMax: 0 });

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };
        // directScaler's own row makes anything tagged "Fuel" feed into IT (not the root) — so indirectScaler
        // lands at depth 2 (feeds the depth-1 item, not the root directly).
        const directScalerRow: MechanicRow = {
            id: "direct-scaler-consumes-fuel",
            table: "MechAddValue",
            itemId: "direct-scaler",
            fields: { ActivatorType: "BallPass", ActivatorTag: "Fuel" },
        };

        const build: Build = { id: "build-1", name: "Root Build", items: ["root", "direct-scaler", "indirect-scaler"] };
        const balanceConfig: BalanceConfig = { depthCoefficients: {}, scaleChelAppearanceProbability: 0, mechanicInfluence: {} };

        const shopAppearances = new Map([
            ["direct-scaler", { itemId: "direct-scaler", packs: [], perSlotProbability: 0.3, perVisitProbability: 0.3 }],
            ["indirect-scaler", { itemId: "indirect-scaler", packs: [], perSlotProbability: 0.9, perVisitProbability: 0.9 }],
        ]);

        const powers = computeItemPowers(
            [root, directScaler, indirectScaler],
            [build],
            [payoff, directScalerRow],
            [],
            [],
            balanceConfig,
            shopAppearances
        );

        const rootPower = powers.get("root")!;
        // Confirm the fixture actually placed indirectScaler at depth 2 relative to root — sanity check on the
        // build-presence data this test's premise depends on.
        expect(rootPower.buildPresence).toEqual([{ buildId: "build-1", buildName: "Root Build", depth: 0, coefficient: 0 }]);
        const indirectPresence = powers.get("indirect-scaler")!.buildPresence[0];
        expect(indirectPresence.depth).toBe(2);

        // Only direct-scaler's 0.3 counts — indirect-scaler's 0.9 is excluded despite being a real (indirect) lever.
        expect(rootPower.probability).toBeCloseTo(0.3);
        expect(rootPower.probabilitySources).toEqual([
            { itemId: "direct-scaler", buildId: "build-1", buildName: "Root Build", probability: 0.3 },
        ]);
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
        const balanceConfig: BalanceConfig = { depthCoefficients: { 0: 0, 1: 0 }, scaleChelAppearanceProbability: 0.9, mechanicInfluence: {} };

        // No shopAppearances passed at all this time.
        const powers = computeItemPowers([root, scaler], [build], [payoff], [], [], balanceConfig);

        const rootPower = powers.get("root")!;
        expect(rootPower.probabilityIsAuto).toBe(true);
        expect(rootPower.probability).toBe(0); // real root, just no scaler shop data — not the 0.9 fallback
    });

    it("mechanicPower lets a valueless item (avg=0) still score real power from its mechanics' TargetCount × Влияние", () => {
        // No ValueMin/ValueMax/MoneyValue at all — `power` would read as ~0, but this item activates a lot.
        const activator = makeItem("activator", { valueMin: 0, valueMax: 0, raw: {} });

        const activateRow: MechanicRow = {
            id: "activator-activate-1",
            table: "MechActivate",
            itemId: "activator",
            fields: { TargetCount: "3" },
        };
        // A second row of the same table — sums into the same table's targetCountSum.
        const activateRow2: MechanicRow = {
            id: "activator-activate-2",
            table: "MechActivate",
            itemId: "activator",
            fields: { TargetCount: "2" },
        };
        const tagRow: MechanicRow = {
            id: "activator-tag-1",
            table: "MechAddTag",
            itemId: "activator",
            fields: { TargetCount: "1" },
        };

        // Neither item is a build root here (no builds passed), so P falls back to this manual constant — set to
        // 0 to confirm the exact bug this formula shape fixes: a bare `× P` used to zero mechanicPower out
        // whenever P was 0, which is both the default and the common case (most items are never a build root).
        // With `(1 + P)`, P = 0 just means "no bonus", not "erase everything" — see the dedicated test below for
        // the P > 0 bonus case.
        const balanceConfig: BalanceConfig = {
            depthCoefficients: {},
            scaleChelAppearanceProbability: 0,
            mechanicInfluence: { MechActivate: 2, MechAddTag: 5, MechAddValue: 100 }, // MechAddValue unused here
        };

        const powers = computeItemPowers([activator], [], [activateRow, activateRow2, tagRow], [], [], balanceConfig);
        const power = powers.get("activator")!;

        expect(power.power).toBe(0); // the original formula sees nothing here — avg=0, no build presence
        expect(power.mechanicTerms).toEqual([
            { table: "MechActivate", targetCountSum: 5, influence: 2, term: 10 }, // (3+2) × 2, no avg factor
            { table: "MechAddTag", targetCountSum: 1, influence: 5, term: 5 },
        ]);
        expect(power.mechanicTermsSum).toBe(15); // 10 + 5
        expect(power.mechanicPower).toBe(15); // MoneyValue(0) + 15×(1+0) + buildTerm(0) — NOT zeroed by P=0
    });

    it("mechanicPower's MechAddValue term is scaled by averageValue, unlike every other mechanic table", () => {
        const item = makeItem("item", { valueMin: 2, valueMax: 8, raw: {} }); // avg = 5

        const row: MechanicRow = {
            id: "item-addvalue-1",
            table: "MechAddValue",
            itemId: "item",
            fields: { TargetCount: "4" },
        };
        const balanceConfig: BalanceConfig = {
            depthCoefficients: {},
            scaleChelAppearanceProbability: 0,
            mechanicInfluence: { MechAddValue: 3 },
        };

        const powers = computeItemPowers([item], [], [row], [], [], balanceConfig);
        const power = powers.get("item")!;

        expect(power.mechanicTerms).toEqual([{ table: "MechAddValue", targetCountSum: 4, influence: 3, term: 60 }]); // 5 × 4 × 3
        expect(power.mechanicPower).toBe(60); // 60 × (1+0), P=0 doesn't zero it out
    });

    it("mechanicPower's mechanic-terms sum (only) gets a (1+P) bonus — MoneyValue/buildTerm stay untouched by P", () => {
        // Real ValueMin/ValueMax range required for isEligiblePayoffRow to treat "root" as a real build root at
        // all (see the earlier "excludes MainValue payoffs..." test in relations.test.ts) — chosen at 1/1 (not
        // 0/0) specifically so root is still recognized as a root, while contributing 0 to averageValue-driven
        // terms (no MechAddValue row here, so avg never enters mechanicTermsSum).
        const root = makeItem("root", { valueMin: 1, valueMax: 1, raw: { MoneyValue: "7" } });
        const scaler = makeItem("scaler", { tags: ["Boost"], valueMin: 0, valueMax: 0 });

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };
        const activateRow: MechanicRow = {
            id: "root-activate-1",
            table: "MechActivate",
            itemId: "root",
            fields: { TargetCount: "10" },
        };
        const build: Build = { id: "build-1", name: "Root Build", items: ["root", "scaler"] };
        const balanceConfig: BalanceConfig = {
            depthCoefficients: { 0: 2 }, // root's own depth-0 coefficient — feeds buildTerm, unrelated to P
            scaleChelAppearanceProbability: 0,
            mechanicInfluence: { MechActivate: 1 },
        };
        // scaler's own shop probability — this becomes root's P (0.25), auto-computed since root is a build root.
        const shopAppearances = new Map([
            ["scaler", { itemId: "scaler", packs: [], perSlotProbability: 0.25, perVisitProbability: 0.25 }],
        ]);

        const powers = computeItemPowers(
            [root, scaler],
            [build],
            [payoff, activateRow],
            [],
            [],
            balanceConfig,
            shopAppearances
        );
        const power = powers.get("root")!;

        expect(power.probability).toBeCloseTo(0.25);
        expect(power.moneyValue).toBe(7);
        expect(power.buildTerm).toBe(2); // avg(1) × coefficient(2) — untouched by P
        expect(power.mechanicTermsSum).toBe(10); // TargetCount(10) × Влияние(1)
        expect(power.mechanicTermsWithProbability).toBeCloseTo(12.5); // 10 × (1 + 0.25)
        expect(power.mechanicPower).toBeCloseTo(21.5); // MoneyValue(7) + 12.5 + buildTerm(2)
    });
});
