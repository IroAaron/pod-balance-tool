import { describe, expect, it } from "vitest";
import { computeBuildTree } from "./buildTree";
import type { Item } from "../models/Item";
import type { Build } from "../models/Build";
import type { MechanicRow } from "../models/Mechanic";
import type { ReplaceRule } from "../models/ReplaceRule";

function makeItem(id: string, overrides: Partial<Item> = {}): Item {
    return { id, tags: [], raw: {}, ...overrides };
}

function makeBuild(items: string[]): Build {
    return { id: "build-1", name: "Test", items };
}

/** A's own mechanic row directly references `targetId` — this is exactly what relatedItems() treats as a strong "прямая ссылка по Id" signal. */
function directRefMechanic(fromId: string, targetId: string): MechanicRow {
    return { id: `${fromId}-mech`, table: "MechAddValue", itemId: fromId, fields: { UseTargetIds: targetId } };
}

describe("computeBuildTree", () => {
    it("puts the build's first item at tier 0 with no parents", () => {
        const build = makeBuild(["root"]);
        const items = [makeItem("root")];

        const { nodes } = computeBuildTree(build, items, [], [], []);
        expect(nodes).toEqual([{ itemId: "root", tier: 0, parents: [] }]);
    });

    it("places a directly-connected Card item at tier 1", () => {
        const build = makeBuild(["root", "card-a"]);
        const items = [makeItem("root", { itemType: "House" }), makeItem("card-a", { itemType: "Card" })];
        const mechanics = [directRefMechanic("root", "card-a")];

        const { nodes } = computeBuildTree(build, items, mechanics, [], []);
        expect(nodes).toContainEqual({ itemId: "card-a", tier: 1, parents: ["root"] });
    });

    it("places a directly-connected House/Artefact item at tier 2", () => {
        const build = makeBuild(["root", "house-a"]);
        const items = [makeItem("root", { itemType: "Card" }), makeItem("house-a", { itemType: "House" })];
        const mechanics = [directRefMechanic("root", "house-a")];

        const { nodes } = computeBuildTree(build, items, mechanics, [], []);
        expect(nodes).toContainEqual({ itemId: "house-a", tier: 2, parents: ["root"] });
    });

    it("places an item only reachable through a tier-1/2 item at tier 3, regardless of its own type", () => {
        const build = makeBuild(["root", "card-a", "far-item"]);
        const items = [
            makeItem("root", { itemType: "Card" }),
            makeItem("card-a", { itemType: "Card" }),
            makeItem("far-item", { itemType: "Card" }),
        ];
        // root -> card-a (tier 1), card-a -> far-item (no direct root link at all).
        const mechanics = [directRefMechanic("root", "card-a"), directRefMechanic("card-a", "far-item")];

        const { nodes } = computeBuildTree(build, items, mechanics, [], []);
        expect(nodes).toContainEqual({ itemId: "far-item", tier: 3, parents: ["card-a"] });
    });

    it("keeps going past tier 3 for longer chains", () => {
        const build = makeBuild(["root", "card-a", "t3", "t4"]);
        const items = [
            makeItem("root", { itemType: "Card" }),
            makeItem("card-a", { itemType: "Card" }),
            makeItem("t3", { itemType: "Card" }),
            makeItem("t4", { itemType: "Card" }),
        ];
        const mechanics = [
            directRefMechanic("root", "card-a"),
            directRefMechanic("card-a", "t3"),
            directRefMechanic("t3", "t4"),
        ];

        const { nodes } = computeBuildTree(build, items, mechanics, [], []);
        expect(nodes.find((n) => n.itemId === "t4")).toEqual({ itemId: "t4", tier: 4, parents: ["t3"] });
    });

    it("buckets a build member with no discoverable connection as unconnected", () => {
        const build = makeBuild(["root", "island"]);
        const items = [makeItem("root"), makeItem("island")];

        const { nodes, unconnected } = computeBuildTree(build, items, [], [], []);
        expect(nodes.map((n) => n.itemId)).toEqual(["root"]);
        expect(unconnected).toEqual(["island"]);
    });

    it("does not treat a shared tag alone as a connection (tags were removed as a signal project-wide)", () => {
        const build = makeBuild(["root", "same-tag"]);
        const items = [makeItem("root", { tags: ["Sport"] }), makeItem("same-tag", { tags: ["Sport"] })];

        const { nodes, unconnected } = computeBuildTree(build, items, [], [], []);
        expect(nodes.map((n) => n.itemId)).toEqual(["root"]);
        expect(unconnected).toEqual(["same-tag"]);
    });

    it("ignores a direct connection to an item outside this build", () => {
        const build = makeBuild(["root", "member"]);
        const items = [makeItem("root"), makeItem("member"), makeItem("outsider")];
        // root links to "outsider", which isn't part of this build — shouldn't place it or affect "member".
        const mechanics = [directRefMechanic("root", "outsider")];

        const { nodes, unconnected } = computeBuildTree(build, items, mechanics, [], []);
        expect(nodes.map((n) => n.itemId)).toEqual(["root"]);
        expect(unconnected).toEqual(["member"]);
    });

    it("connects a scaler via its BonusTargetTag matching the other item's static tag (real Фермер/Ферма shape)", () => {
        // Фермер (root) has a MechAddValue payoff with BonusTargetTag=Farmer; Ферма is statically tagged Farmer
        // and has no mechanic rows of her own at all — this is exactly why cascade generation put her in the
        // build (a level-2 scaler match), but before this fix the tree had no signal for it and bucketed her as
        // unconnected. Not the same thing as the "shared tag alone" test above — there the *tag itself* just
        // happened to be equal on both sides with no mechanic row filtering on it; here one side's own mechanic
        // explicitly filters by that tag, a directed, causal reference.
        const build = makeBuild(["farmer", "farm"]);
        const items = [makeItem("farmer", { itemType: "Card" }), makeItem("farm", { itemType: "House", tags: ["Food", "Farmer"] })];
        const mechanics: MechanicRow[] = [
            {
                id: "farmer-payoff",
                table: "MechAddValue",
                itemId: "farmer",
                fields: { TargetType: "PlayerScore", BonusTargetType: "NotRoad", BonusTargetTag: "Farmer" },
            },
        ];

        const { nodes, unconnected } = computeBuildTree(build, items, mechanics, [], []);
        expect(unconnected).toEqual([]);
        expect(nodes.find((n) => n.itemId === "farm")).toEqual({ itemId: "farm", tier: 2, parents: ["farmer"] });
    });

    it("routes a 2-ingredient ReplaceItem combination through a synthetic combo node instead of flat pairwise edges (real Уличный музыкант+Продюсер→Рок музыкант shape)", () => {
        const build = makeBuild(["rock_musician", "street_musician", "producer"]);
        const items = [makeItem("rock_musician"), makeItem("street_musician"), makeItem("producer")];
        const replaceRules: ReplaceRule[] = [
            {
                id: "street-to-rock",
                source: "ReplaceItem",
                itemIdToReplace: "street_musician",
                replacementItem: "rock_musician",
                fields: { NeededItem: "producer", NeededItemPlace: "Near", NeededItemNumber: "1" },
            },
        ];

        const { nodes, unconnected } = computeBuildTree(build, items, [], [], replaceRules);

        expect(unconnected).toEqual([]);
        const comboNode = nodes.find((n) => n.combo);
        expect(comboNode).toBeDefined();
        expect(comboNode!.parents).toEqual(["rock_musician"]);
        expect(new Set(comboNode!.combo!.ingredientIds)).toEqual(new Set(["street_musician", "producer"]));
        expect(comboNode!.combo!.resultId).toBe("rock_musician");

        // No flat direct edge from root straight to either ingredient — only through the combo.
        expect(nodes.find((n) => n.itemId === "street_musician")!.parents).toEqual([comboNode!.itemId]);
        expect(nodes.find((n) => n.itemId === "producer")!.parents).toEqual([comboNode!.itemId]);
    });

    it("keeps an ingredient's OTHER independent connection alongside its combo edge (real Уличный музыкант shape — Music-tag scaler of Рок музыкант, AND a combo ingredient with Продюсер)", () => {
        // Уличный музыкант feeds the Продюсер combo that produces Рок музыкант — but his own "Music" tag also
        // independently matches Рок музыкант's own BonusTargetTag=Music (a level-2-scaler-style connection, same
        // signal as the Фермер/Ферма case above). Both should show: one edge to the combo, one straight to root.
        const build = makeBuild(["rock_musician", "street_musician", "producer"]);
        const items = [
            makeItem("rock_musician", { itemType: "Card" }),
            makeItem("street_musician", { itemType: "Card", tags: ["Music"] }),
            makeItem("producer", { itemType: "Card" }),
        ];
        const mechanics: MechanicRow[] = [
            {
                id: "rock-musician-payoff",
                table: "MechAddValue",
                itemId: "rock_musician",
                fields: { TargetType: "PlayerScore", BonusCountingType: "CellCount", BonusTargetTag: "Music" },
            },
        ];
        const replaceRules: ReplaceRule[] = [
            {
                id: "street-to-rock",
                source: "ReplaceItem",
                itemIdToReplace: "street_musician",
                replacementItem: "rock_musician",
                fields: { NeededItem: "producer", NeededItemPlace: "Near", NeededItemNumber: "1" },
            },
        ];

        const { nodes, unconnected } = computeBuildTree(build, items, mechanics, [], replaceRules);

        expect(unconnected).toEqual([]);
        const comboNode = nodes.find((n) => n.combo)!;
        const streetMusicianNode = nodes.find((n) => n.itemId === "street_musician")!;

        expect(new Set(streetMusicianNode.parents)).toEqual(new Set(["rock_musician", comboNode.itemId]));
        // Продюсер has no other connection of his own — still only reachable through the combo.
        expect(nodes.find((n) => n.itemId === "producer")!.parents).toEqual([comboNode.itemId]);
    });

    it("does not create a combo node for a single-ingredient replace rule (NeededItem not a build member)", () => {
        const build = makeBuild(["rock_musician", "street_musician"]);
        const items = [makeItem("rock_musician"), makeItem("street_musician")];
        const replaceRules: ReplaceRule[] = [
            {
                id: "street-to-rock",
                source: "ReplaceItem",
                itemIdToReplace: "street_musician",
                replacementItem: "rock_musician",
                // "producer" isn't a build member (not in `items` at all) — only 1 real ingredient, not a combination.
                fields: { NeededItem: "producer", NeededItemPlace: "Near", NeededItemNumber: "1" },
            },
        ];

        const { nodes, unconnected } = computeBuildTree(build, items, [], [], replaceRules);

        expect(unconnected).toEqual([]);
        expect(nodes.some((n) => n.combo)).toBe(false);
        expect(nodes.find((n) => n.itemId === "street_musician")!.parents).toEqual(["rock_musician"]);
    });
});
