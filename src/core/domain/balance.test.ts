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

describe("computeItemPowers — buildPresence (feeds S)", () => {
    it("sums the build's own depth coefficient into a member's buildPresence entry", () => {
        const root = makeItem("root", { valueMin: 2, valueMax: 6, raw: { MoneyValue: "10" } });
        const booster = makeItem("booster", { tags: ["Boost"], valueMin: 1, valueMax: 3, raw: { MoneyValue: "5" } });
        const unrelated = makeItem("unrelated", { valueMin: 9, valueMax: 9 });

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };

        const build: Build = { id: "build-1", name: "Test Build", items: ["root", "booster", "unrelated"] };
        const balanceConfig: BalanceConfig = {
            depthCoefficients: { 0: 1, 1: 2 },
            qualifyingBuildDepthThreshold: 6,
        };

        const powers = computeItemPowers([root, booster, unrelated], [build], [payoff], [], [], balanceConfig);

        const rootPower = powers.get("root")!;
        expect(rootPower.moneyValue).toBe(10);
        expect(rootPower.averageValue).toBe(4);
        expect(rootPower.buildPresence).toEqual([{ buildId: "build-1", buildName: "Test Build", depth: 0, coefficient: 1 }]);

        const boosterPower = powers.get("booster")!;
        expect(boosterPower.buildPresence).toEqual([{ buildId: "build-1", buildName: "Test Build", depth: 1, coefficient: 2 }]);

        // A build member with no real structural path to the root (computeCascadeLevels' `unclassified`) has no
        // "ступень" to look up a coefficient for — no buildPresence entry at all.
        const unrelatedPower = powers.get("unrelated")!;
        expect(unrelatedPower.buildPresence).toEqual([]);
        expect(unrelatedPower.qualifyingBuildCount).toBe(0);
    });

    it("collects presence across every build an item is classified into", () => {
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
        const balanceConfig: BalanceConfig = { depthCoefficients: { 0: 0, 1: 3 }, qualifyingBuildDepthThreshold: 6 };

        const powers = computeItemPowers([root, rootB, shared], [buildA, buildB], [payoff, payoffB], [], [], balanceConfig);

        const sharedPower = powers.get("shared")!;
        expect(sharedPower.buildPresence).toHaveLength(2);
        expect(sharedPower.qualifyingBuildCount).toBe(2);
    });
});

describe("computeItemPowers — power = (MoneyValue+MainValue) + (|S|×(M+1)/A) × Σ(Q×V)", () => {
    it("computes the full formula end to end, hand-verified", () => {
        // root: its own build's root, MoneyValue=5, avg=3 (valueMin=2,valueMax=4).
        const root = makeItem("root", { valueMin: 2, valueMax: 4, raw: { MoneyValue: "5" } });
        // scaler: depth-1 direct scaler of root (tags match root's own ActivatorTag), no value of its own.
        const scaler = makeItem("scaler", { tags: ["Boost"], valueMin: 0, valueMax: 0, raw: {} });
        // other: not connected to anything, has its own value.
        const other = makeItem("other", { valueMin: 1, valueMax: 1, raw: { MoneyValue: "9" } });

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };
        const build: Build = { id: "build-1", name: "B1", items: ["root", "scaler"] };
        const balanceConfig: BalanceConfig = {
            depthCoefficients: { 0: 2, 1: 3 },
            qualifyingBuildDepthThreshold: 1, // N=1 — both depth 0 and depth 1 qualify
        };

        const powers = computeItemPowers([root, scaler, other], [build], [payoff], [], [], balanceConfig);

        // root: S={build-1} (depth 0 ≤ 1), Q=root's own MoneyValue+avg=5+3=8, V=depthCoefficients[0]=2 → sumQV=16.
        // M(root) = {scaler} → 1. A=3. multiplier = 1×(1+1)/3 = 2/3. power = (5+3) + (2/3)×16 = 8 + 32/3.
        const rootPower = powers.get("root")!;
        expect(rootPower.qualifyingBuildCount).toBe(1);
        expect(rootPower.sumQV).toBeCloseTo(16);
        expect(rootPower.directConnectionsCount).toBe(1);
        expect(rootPower.totalItemCount).toBe(3);
        expect(rootPower.formulaMultiplier).toBeCloseTo(2 / 3);
        expect(rootPower.power).toBeCloseTo(8 + (2 / 3) * 16);

        // scaler: S={build-1} (its own depth 1 ≤ 1), Q is still the BUILD's root's value (8, not scaler's own 0),
        // V=depthCoefficients[1]=3 → sumQV=24. M(scaler)={root} → 1. multiplier = 1×2/3 = 2/3.
        // power = (0+0) + (2/3)×24 = 16.
        const scalerPower = powers.get("scaler")!;
        expect(scalerPower.qualifyingBuildEntries).toEqual([
            { buildId: "build-1", buildName: "B1", depth: 1, q: 8, v: 3, product: 24 },
        ]);
        expect(scalerPower.power).toBeCloseTo(16);

        // other: no builds at all → S=[], sumQV=0 → the whole second term is 0 regardless of M/A.
        const otherPower = powers.get("other")!;
        expect(otherPower.qualifyingBuildCount).toBe(0);
        expect(otherPower.power).toBeCloseTo(10); // MoneyValue(9) + avg(1), nothing else
    });

    it("N excludes builds where the examined item's own depth is deeper than the threshold", () => {
        const root = makeItem("root", { valueMin: 1, valueMax: 1, raw: {} });
        const direct = makeItem("direct", { tags: ["Boost"], valueMin: 0, valueMax: 0 });
        const indirect = makeItem("indirect", { tags: ["Fuel"], valueMin: 0, valueMax: 0 });

        const payoff: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };
        const directRow: MechanicRow = {
            id: "direct-consumes-fuel",
            table: "MechAddValue",
            itemId: "direct",
            fields: { ActivatorType: "BallPass", ActivatorTag: "Fuel" },
        };
        const build: Build = { id: "build-1", name: "B1", items: ["root", "direct", "indirect"] };

        // N=1: root (depth 0) and direct (depth 1) qualify; indirect (depth 2) does not.
        const balanceConfig: BalanceConfig = {
            depthCoefficients: { 0: 1, 1: 1, 2: 1 },
            qualifyingBuildDepthThreshold: 1,
        };

        const powers = computeItemPowers([root, direct, indirect], [build], [payoff, directRow], [], [], balanceConfig);

        expect(powers.get("root")!.qualifyingBuildCount).toBe(1);
        expect(powers.get("direct")!.qualifyingBuildCount).toBe(1);
        expect(powers.get("indirect")!.qualifyingBuildCount).toBe(0); // depth 2 > N(1) — excluded from S entirely
    });

    it("M (directConnectionsCount) counts both directions within a single qualifying build", () => {
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
        const balanceConfig: BalanceConfig = { depthCoefficients: {}, qualifyingBuildDepthThreshold: 6 };

        const powers = computeItemPowers(
            [root, directScaler, indirectScaler],
            [build],
            [payoff, directScalerRow],
            [],
            [],
            balanceConfig
        );

        const indirectPresence = powers.get("indirect-scaler")!.buildPresence[0];
        expect(indirectPresence.depth).toBe(2); // sanity check on the fixture's premise

        // direct-scaler sits between root and indirect-scaler — its own direct connections are BOTH directions:
        // root (what direct-scaler itself feeds) AND indirect-scaler (what feeds direct-scaler).
        expect(powers.get("direct-scaler")!.directConnectionsCount).toBe(2);
    });

    it("M is found only inside builds that qualify for S, not every build the item is in", () => {
        // Two separate builds, two separate roots, and X is a direct scaler of BOTH — but N=0 excludes X's own
        // depth-1 presence from S in either build, so S is empty for X, and M (only ever looked up per qualifying
        // build) must be 0 too — not "2" the way an S-independent M would read.
        const r1 = makeItem("r1", { valueMin: 1, valueMax: 1, raw: {} });
        const r2 = makeItem("r2", { valueMin: 1, valueMax: 1, raw: {} });
        const x = makeItem("x", { tags: ["Boost1", "Boost2"], valueMin: 0, valueMax: 0 });

        const payoff1: MechanicRow = {
            id: "r1-payoff",
            table: "MechAddValue",
            itemId: "r1",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost1" },
        };
        const payoff2: MechanicRow = {
            id: "r2-payoff",
            table: "MechAddValue",
            itemId: "r2",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost2" },
        };
        const buildA: Build = { id: "build-a", name: "A", items: ["r1", "x"] };
        const buildB: Build = { id: "build-b", name: "B", items: ["r2", "x"] };

        const balanceConfig: BalanceConfig = {
            depthCoefficients: { 0: 1, 1: 1 },
            qualifyingBuildDepthThreshold: 0, // N=0 — X's own depth-1 presence never qualifies for S
        };

        const powers = computeItemPowers([r1, r2, x], [buildA, buildB], [payoff1, payoff2], [], [], balanceConfig);
        const xPower = powers.get("x")!;

        expect(xPower.qualifyingBuildCount).toBe(0); // S is empty — both of x's presences are depth 1 > N(0)
        expect(xPower.directConnectionsCount).toBe(0); // M is looked up per-build-in-S, so an empty S means M=0 too
        expect(xPower.power).toBeCloseTo(0); // (0 + 0) + multiplier × sumQV(0)
    });

    it("M unions neighbors across every qualifying build, but ignores neighbors found only in a non-qualifying one", () => {
        // root: X's own build (depth 1, qualifies at N=1). R2/y: a second, unrelated build where X sits at depth 2
        // (feeds y, which feeds R2) — deeper than N, so that build is excluded from S, and y must NOT count
        // toward X's M even though it's a perfectly real direct neighbor of X within that other build.
        const root = makeItem("root", { valueMin: 1, valueMax: 1, raw: {} });
        const x = makeItem("x", { tags: ["Boost", "Fuel2"], valueMin: 0, valueMax: 0 });
        const r2 = makeItem("r2", { valueMin: 1, valueMax: 1, raw: {} });
        const y = makeItem("y", { tags: ["Something"], valueMin: 0, valueMax: 0 });

        const payoffRoot: MechanicRow = {
            id: "root-payoff",
            table: "MechAddValue",
            itemId: "root",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Boost" },
        };
        const payoffR2: MechanicRow = {
            id: "r2-payoff",
            table: "MechAddValue",
            itemId: "r2",
            fields: { TargetType: "PlayerScore", TargetValueType: "MainValue", ActivatorType: "BallPass", ActivatorTag: "Something" },
        };
        // y's own row makes anything tagged "Fuel2" (x) feed into y specifically, landing x at depth 2 in build B.
        const yRow: MechanicRow = {
            id: "y-consumes-fuel2",
            table: "MechAddValue",
            itemId: "y",
            fields: { ActivatorType: "BallPass", ActivatorTag: "Fuel2" },
        };

        const buildA: Build = { id: "build-a", name: "A", items: ["root", "x"] };
        const buildB: Build = { id: "build-b", name: "B", items: ["r2", "y", "x"] };

        const balanceConfig: BalanceConfig = {
            depthCoefficients: { 0: 1, 1: 1, 2: 1 },
            qualifyingBuildDepthThreshold: 1, // N=1 — build A (depth 1) qualifies, build B (depth 2) doesn't
        };

        const powers = computeItemPowers(
            [root, x, r2, y],
            [buildA, buildB],
            [payoffRoot, payoffR2, yRow],
            [],
            [],
            balanceConfig
        );
        const xPower = powers.get("x")!;

        expect(xPower.qualifyingBuildCount).toBe(1); // only build A
        expect(xPower.directConnectionsCount).toBe(1); // just root — y (from the excluded build B) doesn't count
    });
});
