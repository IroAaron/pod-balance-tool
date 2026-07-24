import { describe, expect, it } from "vitest";
import { computeBuildConnections, computeCascadeBuilds, computeCascadeLevels, relatedItems } from "./relations";
import type { Item } from "../models/Item";
import type { MechanicRow } from "../models/Mechanic";
import type { ReplaceRule } from "../models/ReplaceRule";
import type { Build } from "../models/Build";

/**
 * Regression coverage for computeCascadeBuilds' root-eligibility rule, which took several failed attempts to
 * get right (see project memory for the full history — TargetValueType alone, then Activator/Bonus field
 * presence, then a description-text check, each failed on a real example a previous round had gotten right).
 * The fixtures below mirror the exact field shapes of the real, validated items from the actual game data, so a
 * future change to this logic can be checked against known-correct behavior without re-fetching CSVs.
 */

function makeItem(id: string, overrides: Partial<Item> = {}): Item {
    return { id, tags: [], raw: {}, nameKey: id, ...overrides };
}

function makeMainValuePayoff(itemId: string, fields: Record<string, string> = {}): MechanicRow {
    return {
        id: `${itemId}-payoff`,
        table: "MechAddValue",
        itemId,
        fields: {
            TargetType: "PlayerScore",
            TargetValueType: "MainValue",
            ActivatorType: "BallPass",
            ActivatorPlace: "MyPosition",
            ...fields,
        },
    };
}

function rootsOf(items: Item[], mechanics: MechanicRow[], includeMoneyValueRoots = false): Set<string> {
    const drafts = computeCascadeBuilds(items, mechanics, [], [], (item) => item.id, includeMoneyValueRoots);
    return new Set(drafts.map((draft) => draft.items[0]));
}

describe("computeCascadeBuilds root eligibility", () => {
    it("excludes MainValue payoffs on items with no real ValueMin/ValueMax range (real Бездомный/Заключенный/Уличный музыкант shape)", () => {
        const homeless = makeItem("homeless", { valueMin: 0, valueMax: 0 }); // real: ValueMin=0, ValueMax=0
        const prisoner = makeItem("prisoner", { valueMin: 0, valueMax: 0 }); // real: ValueMin=0, ValueMax=0
        const streetMusician = makeItem("street_musician"); // real: both blank -> undefined here
        const items = [homeless, prisoner, streetMusician];
        const mechanics = items.map((item) => makeMainValuePayoff(item.id));

        const roots = rootsOf(items, mechanics);

        for (const item of items) {
            expect(roots.has(item.id)).toBe(false);
        }
    });

    it("includes real thematic payoffs with a configured value range (real Footballer/Artist/Police officer/Rock musician shape)", () => {
        const footballer = makeItem("footballer", { tags: ["Sport", "Soccer"], valueMin: 5, valueMax: 5 });
        const artist = makeItem("artist", { valueMin: 5, valueMax: 5 });
        const policeOfficer = makeItem("police_officer", { valueMin: 15, valueMax: 15 });
        const rockMusician = makeItem("rock_musician", { valueMin: 15, valueMax: 15 });
        const soccerScaler = makeItem("soccer_scaler", { tags: ["Soccer"] });
        const colorProducer = makeItem("color_producer");
        const criminalItem = makeItem("criminal_item", { tags: ["Criminal"] });
        const musicScaler = makeItem("music_scaler", { tags: ["Music"] });

        const items = [footballer, artist, policeOfficer, rockMusician, soccerScaler, colorProducer, criminalItem, musicScaler];
        const mechanics = [
            makeMainValuePayoff(footballer.id, { BonusTargetTag: "Soccer", BonusCountingType: "CellCount" }),
            makeMainValuePayoff(artist.id, { ActivatorType: "ColorChange", ActivatorPlace: "All" }),
            makeMainValuePayoff(policeOfficer.id, { ActivatorType: "ItemRemoved", ActivatorTag: "Criminal" }),
            makeMainValuePayoff(rockMusician.id, { BonusTargetTag: "Music", BonusCountingType: "CellCount" }),
            { id: "color_producer-effect", table: "MechChangeColor", itemId: colorProducer.id, fields: { NewColor: "Red" } },
        ];

        const roots = rootsOf(items, mechanics);

        expect(roots.has(footballer.id)).toBe(true);
        expect(roots.has(artist.id)).toBe(true);
        expect(roots.has(policeOfficer.id)).toBe(true);
        expect(roots.has(rockMusician.id)).toBe(true);
    });

    it("KNOWN ACCEPTED GAP: an item with a nonzero ValueMin/ValueMax still passes even if it's actually a flat payoff (real Producer shape)", () => {
        // Producer (c_chel_money_2_1) has ValueMin=5, ValueMax=5 in the real data despite its description
        // confirming it's exactly as flat as Бездомный/Заключенный ("Дает ${MoneyValue}", no dynamic value
        // mentioned). The user explicitly chose the structural ValueMin/ValueMax rule over a description-text
        // check, accepting this specific false positive. This test documents that choice — if it starts
        // failing, ValueMin/ValueMax stopped matching Producer's real data, not that the rule itself broke.
        const producer = makeItem("producer", { valueMin: 5, valueMax: 5 });
        const scaler = makeItem("producer_scaler", { tags: ["Rich"] });
        const mechanics = [makeMainValuePayoff(producer.id, { BonusTargetTag: "Rich", BonusCountingType: "CellCount" })];

        const roots = rootsOf([producer, scaler], mechanics);

        expect(roots.has(producer.id)).toBe(true);
    });

    it("includes flat payoffs (ValueMin=ValueMax=0) when includeMoneyValueRoots is true", () => {
        const item = makeItem("homeless2", { valueMin: 0, valueMax: 0 });
        const scaler = makeItem("homeless2_scaler", { tags: ["Bum"] });
        const mechanics = [makeMainValuePayoff(item.id, { BonusTargetTag: "Bum" })];

        const roots = rootsOf([item, scaler], mechanics, true);

        expect(roots.has(item.id)).toBe(true);
    });
});

/**
 * Regression coverage for the 2026-07-18 pass on which *items* a cascade build pulls in (as opposed to root
 * eligibility above) — six real over-inclusion/under-inclusion reports the user filed against real generated
 * builds (Бухгалтер, Военный, Казино, Дурка, Музей, Рок музыкант, Медсестра), each traced to a specific matching
 * rule in computeCascadeBuilds. Fixtures mirror the real field shapes that exposed each bug.
 */

function buildItemsFor(
    rootId: string,
    items: Item[],
    mechanics: MechanicRow[],
    replaceRules: ReplaceRule[] = []
): Set<string> | undefined {
    const drafts = computeCascadeBuilds(items, mechanics, replaceRules, [], (item) => item.id);
    const draft = drafts.find((d) => d.items[0] === rootId);
    return draft ? new Set(draft.items) : undefined;
}

describe("computeCascadeBuilds item selection", () => {
    it("level 2 scalers require the Bonus filter's tag AND type together, not either alone (real Бухгалтер shape)", () => {
        // c_chel_money_percent_of_opposite_rich_money_1 (Бухгалтер): BonusTargetType=Card, BonusTargetTag=Rich —
        // one compound condition ("a Card tagged Rich"), not "any Card" union "anything tagged Rich". Without the
        // fix, BonusTargetType=Card alone pulled in nearly every Card-type item in the real dataset (~50 unrelated
        // items in a 66-item draft).
        const accountant = makeItem("accountant", { valueMin: 1, valueMax: 1, tags: ["Finance"] });
        const richCard = makeItem("rich_card", { itemType: "Card", tags: ["Rich"] });
        const plainCard = makeItem("plain_card", { itemType: "Card", tags: [] });
        const richHouse = makeItem("rich_house", { itemType: "House", tags: ["Rich"] });
        const items = [accountant, richCard, plainCard, richHouse];
        const mechanics = [
            makeMainValuePayoff(accountant.id, {
                BonusCountingType: "ItemMoneyValue",
                BonusTargetType: "Card",
                BonusTargetTag: "Rich",
            }),
        ];

        const built = buildItemsFor(accountant.id, items, mechanics);

        expect(built?.has(richCard.id)).toBe(true);
        expect(built?.has(plainCard.id)).toBe(false);
        expect(built?.has(richHouse.id)).toBe(false);
    });

    it("a relative color placeholder (Same/NotSame/Random) matches every recolorer, not just an exact string match (real Военный/Казино shape)", () => {
        // Военный's BonusTargetColor=Same and Казино's ActivatorColor=Same only coincidentally matched a
        // recolorer whose own NewColor was literally "Same" (Черлидер) — a recolorer using a different
        // placeholder (Сумасшедший's NewColor=Random, Болельщик's NewColor=NotSame) was silently excluded even
        // though it's equally relevant — none of these placeholders resolve to a literal color ahead of time.
        const military = makeItem("military", { valueMin: 3, valueMax: 3, tags: ["Military"] });
        const cheerleader = makeItem("cheerleader");
        const crazy = makeItem("crazy");
        const fan = makeItem("fan");
        const items = [military, cheerleader, crazy, fan];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(military.id, {
                BonusCountingType: "CellCount",
                BonusTargetPlace: "All",
                BonusTargetColor: "Same",
                BonusTargetTag: "Military",
            }),
            { id: "cheerleader-recolor", table: "MechChangeColor", itemId: cheerleader.id, fields: { NewColor: "Same" } },
            { id: "crazy-recolor", table: "MechChangeColor", itemId: crazy.id, fields: { NewColor: "Random" } },
            { id: "fan-recolor", table: "MechChangeColor", itemId: fan.id, fields: { NewColor: "NotSame" } },
        ];

        const built = buildItemsFor(military.id, items, mechanics);

        expect(built?.has(cheerleader.id)).toBe(true);
        expect(built?.has(crazy.id)).toBe(true);
        expect(built?.has(fan.id)).toBe(true);
    });

    it("an ActivatorTag narrows a structurally-produced event to producers of that specific tag, not every producer of the event (real Дурка shape)", () => {
        // Дурка listens for ActivatorType=ItemPlaced + ActivatorTag=Crazy. Before the fix, any item placing
        // *anything* via MechAddItem ("поставить") counted as an activator regardless of what it placed — the
        // real build had 9 unrelated "placer" houses alongside the one that actually places a Crazy-tagged item
        // (Секретная лаборатория).
        const madhouse = makeItem("madhouse", { valueMin: 10, valueMax: 10 });
        const crazyChel = makeItem("crazy_chel", { tags: ["Crazy"] });
        const secretLab = makeItem("secret_lab");
        const unrelatedPlacer = makeItem("unrelated_placer");
        const unrelatedTarget = makeItem("unrelated_target", { tags: ["Bum"] });
        const items = [madhouse, crazyChel, secretLab, unrelatedPlacer, unrelatedTarget];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(madhouse.id, { ActivatorType: "ItemPlaced", ActivatorPlace: "SameSide", ActivatorTag: "Crazy" }),
            {
                id: "secret-lab-place",
                table: "MechAddItem",
                itemId: secretLab.id,
                fields: { ItemMech: "поставить", NewItemId: crazyChel.id },
            },
            {
                id: "unrelated-place",
                table: "MechAddItem",
                itemId: unrelatedPlacer.id,
                fields: { ItemMech: "поставить", NewItemId: unrelatedTarget.id },
            },
        ];

        const built = buildItemsFor(madhouse.id, items, mechanics);

        expect(built?.has(crazyChel.id)).toBe(true); // matches ActivatorTag directly via its own static tag
        expect(built?.has(secretLab.id)).toBe(true); // places a Crazy-tagged item specifically
        expect(built?.has(unrelatedPlacer.id)).toBe(false); // places something, but nothing Crazy-tagged
    });

    it("spawnersOf from a ReplaceItem/ReplaceOnTrigger rule is directional — the replacement isn't a 'spawner of' what it replaced (real Музей/Рок музыкант shape)", () => {
        // Уличный музыкант (a Музей scaler, tagged Art) has a ReplaceItem rule turning him into Рок музыкант.
        // Before the fix that link was symmetric, so "spawners of the Art-tagged scaler" wrongly included Рок
        // музыкант too — he doesn't spawn/produce the scaler, he's what the scaler *becomes*, an unrelated
        // (Music-themed) career-progression link, not an Art one.
        const museum = makeItem("museum", { valueMin: 5, valueMax: 5, tags: ["Entertainment"] });
        const streetMusician = makeItem("street_musician", { tags: ["Art", "Music"] });
        const rockMusician = makeItem("rock_musician", { tags: ["Music", "Rich"] });
        const items = [museum, streetMusician, rockMusician];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(museum.id, {
                ActivatorType: "ItemActivated",
                ActivatorTag: "Collector",
                BonusCountingType: "CellCount",
                BonusTargetPlace: "SameSide",
                BonusTargetTag: "Art",
            }),
        ];
        const replaceRules: ReplaceRule[] = [
            {
                id: "street-to-rock",
                source: "ReplaceItem",
                itemIdToReplace: streetMusician.id,
                replacementItem: rockMusician.id,
                fields: { NeededItem: "producer", NeededItemPlace: "Near", NeededItemNumber: "1" },
            },
        ];

        const built = buildItemsFor(museum.id, items, mechanics, replaceRules);

        expect(built?.has(streetMusician.id)).toBe(true); // real Art-tagged scaler
        expect(built?.has(rockMusician.id)).toBe(false); // unrelated career-progression target, not a spawner
    });

    it("targeting-by-tag only counts as a boost when it comes from MechAddValue, not from a MechAddItem row that merely shares the tag (real Рок музыкант/Дешёвый мотель shape)", () => {
        // Рок музыкант carries a "Rich" tag (flavor, unrelated to his own Music-themed payoff). Дешёвый мотель's
        // mechanic filters by TargetTag=Rich too, but it's a MechAddItem row that spawns a Маньяк nearby — it
        // doesn't raise any Value/MoneyValue property of whatever it's near, so it shouldn't read as "boosts the
        // root" just because the tag happens to match.
        const rockMusician = makeItem("rock_musician", { valueMin: 15, valueMax: 15, tags: ["Music", "Rich"] });
        const musicBooster = makeItem("music_booster");
        const cheapMotel = makeItem("cheap_motel");
        const items = [rockMusician, musicBooster, cheapMotel];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(rockMusician.id, { BonusCountingType: "CellCount", BonusTargetPlace: "Near", BonusTargetTag: "Music" }),
            {
                id: "music-booster-value",
                table: "MechAddValue",
                itemId: musicBooster.id,
                fields: { TargetType: "Card", TargetValueType: "MainValue", TargetPlace: "Near", TargetTag: "Rich" },
            },
            {
                id: "cheap-motel-spawn",
                table: "MechAddItem",
                itemId: cheapMotel.id,
                fields: {
                    ActivatorType: "ItemRemoved",
                    ActivatorTag: "Prostitute",
                    TargetType: "Road",
                    TargetPlace: "Near",
                    TargetTag: "Rich",
                    ItemMech: "поставить",
                    NewItemId: "maniac",
                },
            },
        ];

        const built = buildItemsFor(rockMusician.id, items, mechanics);

        expect(built?.has(musicBooster.id)).toBe(true); // MechAddValue row — genuinely boosts a Rich-tagged target
        expect(built?.has(cheapMotel.id)).toBe(false); // MechAddItem row — shares the tag but boosts nothing
    });

    it("level 5 also chases spawners of level-3 activators, not just spawners of level-2 scalers (real Медсестра/Маньяк/Мотель chain)", () => {
        // Медсестра listens for ActivatorType=ItemRemoved nearby — Маньяк (a MechAddItem 'удалить' row) is her
        // activator. Дешёвый мотель spawns Маньяк via a MechAddItem 'поставить' row. The full chain (Медсестра
        // profits from Мотель, two hops away) only surfaces if spawners are chased for activators too, mirroring
        // the existing "spawners of scalers" step.
        const nurse = makeItem("nurse", { valueMin: 25, valueMax: 25 });
        const maniac = makeItem("maniac");
        const cheapMotel = makeItem("cheap_motel");
        const items = [nurse, maniac, cheapMotel];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(nurse.id, { ActivatorType: "ItemRemoved", ActivatorPlace: "Near" }),
            { id: "maniac-kill", table: "MechAddItem", itemId: maniac.id, fields: { ActivatorType: "BallPass", ItemMech: "удалить" } },
            {
                id: "motel-spawn-maniac",
                table: "MechAddItem",
                itemId: cheapMotel.id,
                fields: { ActivatorType: "ItemRemoved", ActivatorTag: "Prostitute", ItemMech: "поставить", NewItemId: maniac.id },
            },
        ];

        const built = buildItemsFor(nurse.id, items, mechanics);

        expect(built?.has(maniac.id)).toBe(true); // level 3 — structurally produces ItemRemoved
        expect(built?.has(cheapMotel.id)).toBe(true); // level 5 — spawns the level-3 activator
    });

    it("a ReplaceItem rule's NeededItem is as much a spawner as itemIdToReplace (real Рок музыкант/Музыкальный магазин shape)", () => {
        // Бомж (itemIdToReplace) only becomes Рок музыкант (replacementItem) next to Музыкальный магазин
        // (NeededItem) — Бомж alone never causes the upgrade, so treating only him as "the spawner" is
        // misleading (he was already showing up in Рок музыкант's own build with no Музыкальный магазин at all,
        // even though Музыкальный магазин's own build already correctly listed every ingredient).
        const rockMusician = makeItem("rock_musician", { valueMin: 15, valueMax: 15, tags: ["Music"] });
        const homeless = makeItem("homeless", { tags: ["Bum"] });
        const musicStore = makeItem("music_store");
        const items = [rockMusician, homeless, musicStore];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(rockMusician.id, { BonusCountingType: "CellCount", BonusTargetPlace: "Near", BonusTargetTag: "Music" }),
        ];
        const replaceRules: ReplaceRule[] = [
            {
                id: "homeless-to-rock",
                source: "ReplaceItem",
                itemIdToReplace: homeless.id,
                replacementItem: rockMusician.id,
                fields: { NeededItem: musicStore.id, NeededItemPlace: "Near", NeededItemNumber: "1" },
            },
        ];

        const built = buildItemsFor(rockMusician.id, items, mechanics, replaceRules);

        expect(built?.has(homeless.id)).toBe(true); // itemIdToReplace — still a real prerequisite
        expect(built?.has(musicStore.id)).toBe(true); // NeededItem — the actual actionable ingredient
    });

    it("a MechAddValue row raising LoopComplitedCounter structurally produces ActivatorType=LoopCompleted (real Стадион/Дальнобойщик/Гонщик shape)", () => {
        // Гонщик (c_chel_plus_loop_1) has no PlayerScore payoff of his own — he raises TargetType=LoopComplitedCounter
        // on every BallPass, which is what the engine fires ActivatorType=LoopCompleted for. Before this fix,
        // nothing was recognized as "producing" LoopCompleted, so Гонщик never showed up in Стадион's build, and
        // Дальнобойщик — a lone LoopCompleted root with no other structural connection — never reached the 2-item
        // minimum to become a build at all.
        const stadium = makeItem("stadium", { valueMin: 10, valueMax: 10, tags: ["Sport"] });
        const trucker = makeItem("trucker", { valueMin: 15, valueMax: 15 });
        const racer = makeItem("racer", { tags: ["Sport"] });
        const items = [stadium, trucker, racer];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(stadium.id, { ActivatorType: "LoopCompleted" }),
            makeMainValuePayoff(trucker.id, { ActivatorType: "LoopCompleted" }),
            {
                id: "racer-loop-counter",
                table: "MechAddValue",
                itemId: racer.id,
                fields: {
                    ActivatorType: "BallPass",
                    ActivatorTargetType: "Road",
                    ActivatorPlace: "MyPosition",
                    TargetType: "LoopComplitedCounter",
                    TargetCount: "1",
                },
            },
        ];

        const stadiumBuild = buildItemsFor(stadium.id, items, mechanics);
        const truckerBuild = buildItemsFor(trucker.id, items, mechanics);

        expect(stadiumBuild?.has(racer.id)).toBe(true);
        expect(truckerBuild).toBeDefined(); // previously skipped entirely — root alone never reached size >= 2
        expect(truckerBuild?.has(racer.id)).toBe(true);
    });

    it("level 6 chases activators of level-3 activators via a TargetTag filter (real Дальнобойщик/Гонщик/Тренер shape)", () => {
        // Гонщик enters Дальнобойщик's build at level 3 (produces LoopCompleted, see the test above). Тренер
        // activates any Sport-tagged card (TargetTag=Sport, no UseTargetIds) when the ball passes him — since
        // Гонщик is tagged Sport, Тренер is a genuine second-order lever (more Гонщик activations -> more loops
        // completed -> more Дальнобойщик payoffs) that only level 6 can reach.
        const trucker = makeItem("trucker", { valueMin: 15, valueMax: 15 });
        const racer = makeItem("racer", { tags: ["Sport"] });
        const trainer = makeItem("trainer");
        const unrelated = makeItem("unrelated", { tags: ["Bum"] });
        const items = [trucker, racer, trainer, unrelated];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(trucker.id, { ActivatorType: "LoopCompleted" }),
            {
                id: "racer-loop-counter",
                table: "MechAddValue",
                itemId: racer.id,
                fields: {
                    ActivatorType: "BallPass",
                    ActivatorTargetType: "Road",
                    ActivatorPlace: "MyPosition",
                    TargetType: "LoopComplitedCounter",
                    TargetCount: "1",
                },
            },
            {
                id: "trainer-activate",
                table: "MechActivate",
                itemId: trainer.id,
                fields: { ActivatorType: "BallPass", ActivatorPlace: "MyPosition", TargetType: "Card", TargetTag: "Sport" },
            },
        ];

        const built = buildItemsFor(trucker.id, items, mechanics);

        expect(built?.has(racer.id)).toBe(true); // level 3, unchanged
        expect(built?.has(trainer.id)).toBe(true); // level 6, new
        expect(built?.has(unrelated.id)).toBe(false);
    });

    it("level 6b chases recolorers matching a level-6 activator's own TargetColor filter, but only ones that could actually produce a matching-tag card (real Тренер/Сумасшедший shape)", () => {
        // Тренер's row carries TargetTag=Sport *and* TargetColor=Same — one compound "same-color Sport card"
        // condition, not "any Sport card" union "any recolorer". Сумасшедший only ever repaints himself
        // (TargetPlace=MyPosition on his one MechChangeColor row) and isn't Sport-tagged, so repainting himself
        // can never produce a same-color Sport card — he's correctly excluded, per the user's real bug report.
        // Сумасшедший+-shaped (recolors Near too, real tier-2 shape) IS relevant, since that could land on a
        // nearby Sport card. A hypothetical self-recoloring *Sport*-tagged item is also relevant, since
        // repainting itself is exactly what would make it a matching target.
        const trucker = makeItem("trucker", { valueMin: 15, valueMax: 15 });
        const racer = makeItem("racer", { tags: ["Sport"] });
        const trainer = makeItem("trainer");
        const crazySelfOnly = makeItem("crazy_self_only"); // real Сумасшедший shape: no tags, self-only recolor
        const crazyPlusNear = makeItem("crazy_plus_near"); // real Сумасшедший+ shape: also recolors Near
        const sportSelfPainter = makeItem("sport_self_painter", { tags: ["Sport"] });
        const unrelated = makeItem("unrelated", { tags: ["Bum"] });
        const items = [trucker, racer, trainer, crazySelfOnly, crazyPlusNear, sportSelfPainter, unrelated];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(trucker.id, { ActivatorType: "LoopCompleted" }),
            {
                id: "racer-loop-counter",
                table: "MechAddValue",
                itemId: racer.id,
                fields: {
                    ActivatorType: "BallPass",
                    ActivatorTargetType: "Road",
                    ActivatorPlace: "MyPosition",
                    TargetType: "LoopComplitedCounter",
                    TargetCount: "1",
                },
            },
            {
                id: "trainer-activate",
                table: "MechActivate",
                itemId: trainer.id,
                fields: {
                    ActivatorType: "BallPass",
                    ActivatorPlace: "MyPosition",
                    TargetType: "Card",
                    TargetTag: "Sport",
                    TargetColor: "Same",
                },
            },
            {
                id: "crazy-self-recolor",
                table: "MechChangeColor",
                itemId: crazySelfOnly.id,
                fields: { TargetPlace: "MyPosition", NewColor: "Random" },
            },
            {
                id: "crazy-plus-self-recolor",
                table: "MechChangeColor",
                itemId: crazyPlusNear.id,
                fields: { TargetPlace: "MyPosition", NewColor: "Same" },
            },
            {
                id: "crazy-plus-near-recolor",
                table: "MechChangeColor",
                itemId: crazyPlusNear.id,
                fields: { TargetPlace: "Near", NewColor: "Same" },
            },
            {
                id: "sport-self-painter-recolor",
                table: "MechChangeColor",
                itemId: sportSelfPainter.id,
                fields: { TargetPlace: "MyPosition", NewColor: "Same" },
            },
        ];

        const built = buildItemsFor(trucker.id, items, mechanics);

        expect(built?.has(trainer.id)).toBe(true); // level 6, unchanged
        expect(built?.has(crazySelfOnly.id)).toBe(false); // self-only AND not Sport-tagged — never a valid target
        expect(built?.has(crazyPlusNear.id)).toBe(true); // recolors Near too — could land on a Sport card
        expect(built?.has(sportSelfPainter.id)).toBe(true); // self-only, but already Sport-tagged
        expect(built?.has(unrelated.id)).toBe(false);
    });
});

describe("relatedItems MechActivate tag-filter connections", () => {
    it("a MechActivate row targeting by tag (no UseTargetIds) connects to items statically carrying that tag (real Тренер/Гонщик shape)", () => {
        // Тренер (c_chel_activate_sport_same_color_for_ball_pass_1): MechActivate row with TargetTag=Sport and no
        // UseTargetIds — activates any Sport-tagged card when the ball passes. Before this fix,
        // buildCascadeStyleConnections only inspected MechAddValue rows for this kind of tag-filter match, so
        // Тренер never showed up as related to Гонщик (statically tagged Sport) despite genuinely activating him.
        const trainer = makeItem("trainer");
        const racer = makeItem("racer", { tags: ["Sport"] });
        const unrelated = makeItem("unrelated", { tags: ["Bum"] });
        const items = [trainer, racer, unrelated];
        const mechanics: MechanicRow[] = [
            {
                id: "trainer-activate",
                table: "MechActivate",
                itemId: trainer.id,
                fields: { ActivatorType: "BallPass", ActivatorPlace: "MyPosition", TargetType: "Card", TargetTag: "Sport" },
            },
        ];

        const related = relatedItems(trainer.id, items, mechanics, [], []);
        const racerRelation = related.find((rel) => rel.id === racer.id);

        expect(racerRelation?.strength).toBe("strong");
        expect(related.some((rel) => rel.id === unrelated.id)).toBe(false);
    });
});

/**
 * Regression coverage for the 2026-07-23 7-level redesign — replaces the old "activators of the root" bucket
 * (which conflated a passive tag-matched subject with an active event producer) with a clean split, and adds two
 * new capabilities the user asked for by name: indiscriminate (no-tag) event producers count as candidates
 * instead of being excluded, and a brand new "generic type+position, no tag/id at all" signal for both direct
 * value-boosts and direct activations. Fixtures mirror the real Чёрный рынок (`h_money_for_activate_bum_same_side`)
 * worked example the user gave, field-for-field, pulled from the real `PoD_config.zip`.
 */
describe("computeCascadeBuilds scaling graph (real edges only, recursive depth)", () => {
    it("real Чёрный рынок build: passive Bum subject, indiscriminate killers, and their spawners are included; a generic type-only booster/activator is NOT", () => {
        const blackMarket = makeItem("black_market", { valueMin: 15, valueMax: 15, itemType: "House" });
        const homeless = makeItem("homeless", { tags: ["Bum"] }); // Бездомный — depth 1, the concrete Bum subject
        const maniac = makeItem("maniac", { tags: ["Maniac", "Criminal"] }); // Маньяк — kills Near, no TargetTag
        const killer = makeItem("killer", { tags: ["Man", "Criminal"] }); // Киллер — kills OppositeCard, no TargetTag
        const cheapMotel = makeItem("cheap_motel"); // Дешевый мотель — spawns Маньяк (MechAddItem поставить)
        const player = makeItem("player", { tags: ["Man", "Rich"] }); // Игрок — becomes Бездомный after 3 loops
        // Эстакада/Робот-shaped: boosts/activates any nearby House, no tag, no id — the exact signal removed
        // after the real bug report (Мошенник/Меценат wrongly appearing in "Билд от Гробовщика" this same way).
        const overpass = makeItem("overpass", { itemType: "House" });
        const robot = makeItem("robot", { itemType: "Card" });
        const unrelated = makeItem("unrelated", { tags: ["Rich"], itemType: "Card" });
        const items = [blackMarket, homeless, maniac, killer, cheapMotel, player, overpass, robot, unrelated];

        const mechanics: MechanicRow[] = [
            // Root payoff: real fields — ItemRemoved+SameSide+Bum, PlayerScore/MainValue, flat read (no Bonus*).
            makeMainValuePayoff(blackMarket.id, {
                ActivatorType: "ItemRemoved",
                ActivatorPlace: "SameSide",
                ActivatorTag: "Bum",
            }),
            // Маньяк: MechAddItem удалить, no TargetTag — kills indiscriminately.
            {
                id: "maniac-kill",
                table: "MechAddItem",
                itemId: maniac.id,
                fields: { ActivatorType: "BallPass", ActivatorPlace: "MyPosition", ItemMech: "удалить", TargetPlace: "Near" },
            },
            // Киллер: MechAddItem удалить, no TargetTag, different Place (OppositeCard) — still a candidate, Place
            // never excludes (any item can be placed on any of the 4 sides).
            {
                id: "killer-kill",
                table: "MechAddItem",
                itemId: killer.id,
                fields: { ActivatorType: "LoopCompleted", ItemMech: "удалить", TargetPlace: "OppositeCard" },
            },
            // Дешевый мотель spawns Маньяк directly by id.
            {
                id: "motel-spawn-maniac",
                table: "MechAddItem",
                itemId: cheapMotel.id,
                fields: { ActivatorType: "ItemRemoved", ActivatorTag: "Prostitute", ItemMech: "поставить", NewItemId: maniac.id },
            },
            // Игрок: has his own PlayerScore payoff (flat, not what makes him a root here) — real replace-rule
            // link to Бездомный is supplied separately via replaceRules below.
            makeMainValuePayoff(player.id, {}),
            // Эстакада: MechAddValue boosting MainValue of any nearby House — no tag, no id. Real shape.
            {
                id: "overpass-boost",
                table: "MechAddValue",
                itemId: overpass.id,
                fields: {
                    ActivatorType: "BallPass",
                    ActivatorPlace: "Near",
                    TargetType: "House",
                    TargetValueType: "MainValue",
                    TargetPlace: "Near",
                    TargetCount: "999",
                },
            },
            // Робот: MechActivate activating any 2 nearby Houses — no tag, no id. Real shape.
            {
                id: "robot-activate",
                table: "MechActivate",
                itemId: robot.id,
                fields: { ActivatorType: "BallPass", ActivatorPlace: "MyPosition", TargetType: "House", TargetPlace: "Near", TargetCount: "2" },
            },
        ];

        const replaceRules: ReplaceRule[] = [
            {
                id: "player-to-homeless",
                source: "ReplaceOnTrigger",
                itemIdToReplace: player.id,
                replacementItem: homeless.id,
                fields: { DurationType: "LoopCompleted", Duration: "3" },
            },
        ];

        const drafts = computeCascadeBuilds(items, mechanics, replaceRules, [], (item) => item.id);
        const built = new Set(drafts.find((d) => d.items[0] === blackMarket.id)?.items);

        expect(built.has(homeless.id)).toBe(true); // depth 1 — the concrete Bum subject
        expect(built.has(maniac.id)).toBe(true); // depth 1 — indiscriminate ItemRemoved producer
        expect(built.has(killer.id)).toBe(true); // depth 1 — indiscriminate producer, different Place doesn't exclude
        expect(built.has(cheapMotel.id)).toBe(true); // depth 2 — spawns the depth-1 Маньяк
        expect(built.has(player.id)).toBe(true); // depth 2 — spawns the depth-1 Бездомный (via replace rule)
        expect(built.has(overpass.id)).toBe(false); // no tag/id link at all — generic type-only match is gone
        expect(built.has(robot.id)).toBe(false); // same — no real edge to Чёрный рынок
        expect(built.has(unrelated.id)).toBe(false);
    });

    it("real Гробовщик shape: Мошенник and Меценат have no real edge to the root and are correctly excluded (the actual bug report)", () => {
        // Гробовщик: ActivatorType=ItemRemoved, ActivatorPlace=All, no ActivatorTag — listens to ANY kill
        // anywhere, no Bonus fields at all. Мошенник's own row targets himself (TargetPlace=MyPosition) with a
        // Bonus counted from nearby Rich cards — no tag/id connection to Гробовщик. Меценат boosts any nearby
        // card (TargetPlace=Near, no TargetTag) scaled by nearby Bum count — same story, no tag/id connection.
        const undertaker = makeItem("undertaker", { tags: ["Man"], valueMin: 2, valueMax: 2 });
        const maniac = makeItem("maniac", { tags: ["Maniac", "Criminal"] });
        const scammer = makeItem("scammer", { tags: ["Criminal"] });
        const patron = makeItem("patron", { tags: ["Man", "Rich"] });
        const items = [undertaker, maniac, scammer, patron];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(undertaker.id, { ActivatorType: "ItemRemoved", ActivatorPlace: "All", ActivatorTag: "" }),
            {
                id: "maniac-kill",
                table: "MechAddItem",
                itemId: maniac.id,
                fields: { ActivatorType: "BallPass", ItemMech: "удалить" },
            },
            {
                id: "scammer-self-boost",
                table: "MechAddValue",
                itemId: scammer.id,
                fields: {
                    ActivatorType: "BallPass",
                    TargetType: "Card",
                    TargetValueType: "MoneyValue",
                    TargetPlace: "MyPosition",
                    BonusCountingType: "ItemMoneyValue",
                    BonusTargetType: "Card",
                    BonusTargetPlace: "Near",
                    BonusTargetTag: "Rich",
                },
            },
            {
                id: "patron-boost-near",
                table: "MechAddValue",
                itemId: patron.id,
                fields: {
                    ActivatorType: "BallPass",
                    TargetType: "Card",
                    TargetValueType: "MoneyValue",
                    TargetPlace: "Near",
                    BonusCountingType: "ItemMoneyValue",
                    BonusTargetType: "Road",
                    BonusTargetPlace: "Near",
                    BonusTargetTag: "Bum",
                },
            },
        ];

        const drafts = computeCascadeBuilds(items, mechanics, [], [], (item) => item.id);
        const built = new Set(drafts.find((d) => d.items[0] === undertaker.id)?.items);

        expect(built.has(maniac.id)).toBe(true); // depth 1 — indiscriminate ItemRemoved producer, real edge
        expect(built.has(scammer.id)).toBe(false); // Мошенник — no tag/id link to Гробовщик at all
        expect(built.has(patron.id)).toBe(false); // Меценат — no tag/id link to Гробовщик at all
    });

    it("a concrete different tag on an otherwise-indiscriminate-shaped producer still excludes it (safety rail for the relaxed rule above)", () => {
        // Same root as above, but this killer explicitly names TargetTag=Rich — provably NOT Bum, so unlike a
        // producer with no tag at all, this one must stay excluded even under the relaxed "no tag = candidate"
        // rule. A guaranteed level-2 member (Бездомный, tag=Bum) keeps the build from being dropped for being
        // too small regardless of how richKiller is judged — otherwise a correct exclusion and "no draft at all"
        // would be indistinguishable (see project memory on vacuous-pass test fixtures).
        const blackMarket = makeItem("black_market", { valueMin: 15, valueMax: 15 });
        const homeless = makeItem("homeless", { tags: ["Bum"] });
        const richKiller = makeItem("rich_killer", { tags: ["Man"] });
        const items = [blackMarket, homeless, richKiller];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(blackMarket.id, { ActivatorType: "ItemRemoved", ActivatorPlace: "SameSide", ActivatorTag: "Bum" }),
            {
                id: "rich-killer-kill",
                table: "MechAddItem",
                itemId: richKiller.id,
                fields: { ActivatorType: "BallPass", ItemMech: "удалить", TargetTag: "Rich" },
            },
        ];

        const drafts = computeCascadeBuilds(items, mechanics, [], [], (item) => item.id);
        const built = new Set(drafts.find((d) => d.items[0] === blackMarket.id)?.items);

        expect(built.has(homeless.id)).toBe(true);
        expect(built.has(richKiller.id)).toBe(false);
    });
});

/**
 * Regression coverage for wiring the same cascade-style/tag-aware/generic-type signals into computeBuildConnections
 * (the build<->build graph on GraphPage) — previously this only ever looked at literally shared items, so two
 * builds connected only through a cascade-style signal (e.g. one build has Тренер, another has Гонщик, tag=Sport
 * on both sides but no shared item at all) showed no edge at all, even though the exact same pair would already
 * show up as "Возможно связано с" on the build detail page via relatedBuilds (which already used relatedItems).
 */
function makeBuild(id: string, items: string[], overrides: Partial<Build> = {}): Build {
    return { id, name: id, items, auto: false, ...overrides };
}

describe("computeBuildConnections bridging items", () => {
    it("connects two builds with no shared items but a strong cascade-style link between an item in each (real Тренер/Гонщик shape)", () => {
        const trainer = makeItem("trainer");
        const racer = makeItem("racer", { tags: ["Sport"] });
        const unrelated = makeItem("unrelated", { tags: ["Bum"] });
        const items = [trainer, racer, unrelated];
        const mechanics: MechanicRow[] = [
            {
                id: "trainer-activate",
                table: "MechActivate",
                itemId: trainer.id,
                fields: { ActivatorType: "BallPass", ActivatorPlace: "MyPosition", TargetType: "Card", TargetTag: "Sport" },
            },
        ];
        const buildA = makeBuild("build-a", [trainer.id]);
        const buildB = makeBuild("build-b", [racer.id]);
        const buildC = makeBuild("build-c", [unrelated.id]);
        const builds = [buildA, buildB, buildC];

        const connections = computeBuildConnections(builds, items, mechanics, [], []);

        const aToB = connections.find(
            (c) => (c.source === buildA.id && c.target === buildB.id) || (c.source === buildB.id && c.target === buildA.id)
        );
        const aToC = connections.find(
            (c) => (c.source === buildA.id && c.target === buildC.id) || (c.source === buildC.id && c.target === buildA.id)
        );

        expect(aToB).toBeDefined();
        expect(aToB?.sharedItemCount).toBe(0);
        expect(aToB?.bridgingItemCount).toBe(1);
        expect(aToB?.strength).toBeGreaterThan(0);
        expect(aToC).toBeUndefined();
    });

    it("literal shared items still connect builds as before, weighted higher than a bridging-only pair", () => {
        const shared = makeItem("shared");
        const buildA = makeBuild("build-a", [shared.id, "solo-a"]);
        const buildB = makeBuild("build-b", [shared.id, "solo-b"]);

        const connections = computeBuildConnections([buildA, buildB], [shared], [], [], []);
        const connection = connections[0];

        expect(connection.sharedItemCount).toBe(1);
        expect(connection.bridgingItemCount).toBe(0);
        expect(connection.strength).toBeCloseTo(0.5, 5); // 1 shared / minSize(2)
    });
});

/**
 * Regression coverage for computeCascadeLevels — replaces the old BFS+item-type "Дерево связей" tiering with a
 * per-member classification into the same 7 named levels computeCascadeBuilds itself uses, on the user's
 * explicit request after the old tree's tier 1/2 labels ("прямая связь Card"/"House-Artefact") were confusing
 * next to the new level names and had nothing to do with them.
 */
describe("computeCascadeLevels", () => {
    it("real Дальнобойщик shape: Гонщик is depth 1 (a direct feeder of the root's own payoff)", () => {
        // Дальнобойщик reads its own flat MainValue on LoopCompleted. Гонщик produces LoopCompleted directly for
        // that payoff row, so he's exactly one hop from the root — depth 1, same as any other direct feeder,
        // regardless of *which* kind of relationship (event-producer here) explains him.
        const trucker = makeItem("trucker", { valueMin: 15, valueMax: 15 });
        const racer = makeItem("racer", { tags: ["Sport"] });
        const items = [trucker, racer];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(trucker.id, { ActivatorType: "LoopCompleted" }),
            {
                id: "racer-loop-counter",
                table: "MechAddValue",
                itemId: racer.id,
                fields: {
                    ActivatorType: "BallPass",
                    ActivatorTargetType: "Road",
                    ActivatorPlace: "MyPosition",
                    TargetType: "LoopComplitedCounter",
                    TargetCount: "1",
                },
            },
        ];
        const build = { id: "b1", name: "Билд от Дальнобойщика", items: [trucker.id, racer.id], auto: true };

        const result = computeCascadeLevels(build, items, mechanics, []);

        expect(result.rootEligible).toBe(true);
        const racerNode = result.nodes.find((n) => n.itemId === racer.id);
        expect(racerNode?.depth).toBe(1);
        expect(racerNode?.parents).toEqual([{ itemId: trucker.id, reason: "event-producer" }]);
        expect(result.nodes.some((n) => n.itemId === trucker.id && n.depth === 0)).toBe(true);
        expect(result.unclassified).toEqual([]);
    });

    it("a build member that doesn't match any level under the current root shows as unclassified, not silently dropped or mis-leveled", () => {
        const trucker = makeItem("trucker", { valueMin: 15, valueMax: 15 });
        const stranger = makeItem("stranger", { tags: ["Nothing"] });
        const items = [trucker, stranger];
        const mechanics: MechanicRow[] = [makeMainValuePayoff(trucker.id, { ActivatorType: "LoopCompleted" })];
        const build = { id: "b2", name: "Билд от Дальнобойщика", items: [trucker.id, stranger.id], auto: true };

        const result = computeCascadeLevels(build, items, mechanics, []);

        expect(result.unclassified).toEqual([stranger.id]);
        expect(result.nodes.some((n) => n.itemId === stranger.id)).toBe(false);
    });

    it("root with no PlayerScore payoff at all reports rootEligible=false and every other member unclassified", () => {
        const manual1 = makeItem("manual1");
        const manual2 = makeItem("manual2");
        const build = { id: "b3", name: "Ручной билд", items: [manual1.id, manual2.id], auto: false };

        const result = computeCascadeLevels(build, [manual1, manual2], [], []);

        expect(result.rootEligible).toBe(false);
        expect(result.unclassified).toEqual([manual2.id]);
    });

    it("Тренер is depth 2 and parents to Гонщик specifically, not straight to the root (real Дальнобойщик/Гонщик/Тренер shape)", () => {
        // Гонщик is depth 1 (produces LoopCompleted for Дальнобойщик's own payoff). Тренер activates Гонщик
        // specifically (TargetTag=Sport matching Гонщик's own tag) — he doesn't touch Дальнобойщик's payoff at
        // all, so he's depth 2, one hop further out, and his parent is Гонщик, not the root.
        const trucker = makeItem("trucker", { valueMin: 15, valueMax: 15 });
        const racer = makeItem("racer", { tags: ["Sport"] });
        const trainer = makeItem("trainer");
        const items = [trucker, racer, trainer];
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(trucker.id, { ActivatorType: "LoopCompleted" }),
            {
                id: "racer-loop-counter",
                table: "MechAddValue",
                itemId: racer.id,
                fields: {
                    ActivatorType: "BallPass",
                    ActivatorTargetType: "Road",
                    ActivatorPlace: "MyPosition",
                    TargetType: "LoopComplitedCounter",
                    TargetCount: "1",
                },
            },
            {
                id: "trainer-activate",
                table: "MechActivate",
                itemId: trainer.id,
                fields: { ActivatorType: "BallPass", ActivatorPlace: "MyPosition", TargetType: "Card", TargetTag: "Sport" },
            },
        ];
        const build = { id: "b4", name: "Билд от Дальнобойщика", items: [trucker.id, racer.id, trainer.id], auto: true };

        const result = computeCascadeLevels(build, items, mechanics, []);

        const trainerNode = result.nodes.find((n) => n.itemId === trainer.id);
        expect(trainerNode?.depth).toBe(2);
        expect(trainerNode?.parents).toEqual([{ itemId: racer.id, reason: "activator" }]); // parents to Гонщик, not Дальнобойщик
    });

    it("detects a ReplaceItem combination among build members and folds the combo bubble directly into the depth graph", () => {
        // Both ingredients (itemIdToReplace and NeededItem) are already real depth-1 spawners of the root — any
        // ReplaceItem rule counts both as spawners, combo or not (buildCascadeIndex, unconditional). What the
        // combo layer *adds* is a second, more specific edge through a synthetic bubble showing they combine
        // *together* into the result, alongside (not instead of) that plain spawner edge.
        const rockMusician = makeItem("rock_musician", { valueMin: 15, valueMax: 15, tags: ["Music"] });
        const streetMusician = makeItem("street_musician", { tags: ["Art"] });
        const producer = makeItem("producer");
        const items = [rockMusician, streetMusician, producer];
        const mechanics: MechanicRow[] = [makeMainValuePayoff(rockMusician.id, {})];
        const replaceRules: ReplaceRule[] = [
            {
                id: "street-to-rock",
                source: "ReplaceItem",
                itemIdToReplace: streetMusician.id,
                replacementItem: rockMusician.id,
                fields: { NeededItem: producer.id, NeededItemPlace: "Near", NeededItemNumber: "1" },
            },
        ];
        const build = {
            id: "b5",
            name: "Билд от Рок музыканта",
            items: [rockMusician.id, streetMusician.id, producer.id],
            auto: true,
        };

        const result = computeCascadeLevels(build, items, mechanics, replaceRules);

        const comboNode = result.nodes.find((n) => n.combo);
        expect(comboNode?.combo?.ingredientIds.sort()).toEqual([producer.id, streetMusician.id].sort());
        expect(comboNode?.combo?.resultId).toBe(rockMusician.id);
        // The combo bubble sits one hop past its result (the root, depth 0) — a real position in the same graph,
        // not a separate section.
        expect(comboNode?.depth).toBe(1);
        expect(comboNode?.parents).toEqual([{ itemId: rockMusician.id, reason: "combo-result" }]);
        const streetMusicianNode = result.nodes.find((n) => n.itemId === streetMusician.id);
        const producerNode = result.nodes.find((n) => n.itemId === producer.id);
        expect(streetMusicianNode?.depth).toBe(1); // kept its own real spawner depth, not moved to the combo's
        expect(streetMusicianNode?.parents).toEqual([
            { itemId: rockMusician.id, reason: "spawner" },
            { itemId: comboNode!.itemId, reason: "combo-ingredient" },
        ]);
        expect(producerNode?.depth).toBe(1);
        expect(result.unclassified).toEqual([]);
    });

    it("a combo participant with a real structural connection beyond the shared replace rule keeps all of its edges", () => {
        // Real precedent from the deleted buildTree.ts: a combo participant isn't *exclusively* explained by the
        // combo — every independent connection still shows too, as its own additional edge alongside the rest.
        const rockMusician = makeItem("rock_musician", { valueMin: 15, valueMax: 15, tags: ["Music"] });
        const streetMusician = makeItem("street_musician", { tags: ["Art", "Music"] });
        const producer = makeItem("producer");
        const items = [rockMusician, streetMusician, producer];
        // rockMusician's own payoff also has a Bonus filter matching streetMusician's Music tag directly (a
        // money-scaler connection) — independent of both the spawner edge and the combo.
        const mechanics: MechanicRow[] = [
            makeMainValuePayoff(rockMusician.id, { BonusCountingType: "CellCount", BonusTargetTag: "Music" }),
        ];
        const replaceRules: ReplaceRule[] = [
            {
                id: "street-to-rock",
                source: "ReplaceItem",
                itemIdToReplace: streetMusician.id,
                replacementItem: rockMusician.id,
                fields: { NeededItem: producer.id, NeededItemPlace: "Near", NeededItemNumber: "1" },
            },
        ];
        const build = {
            id: "b6",
            name: "Билд от Рок музыканта",
            items: [rockMusician.id, streetMusician.id, producer.id],
            auto: true,
        };

        const result = computeCascadeLevels(build, items, mechanics, replaceRules);

        const comboNode = result.nodes.find((n) => n.combo);
        const streetMusicianNode = result.nodes.find((n) => n.itemId === streetMusician.id);
        expect(streetMusicianNode?.depth).toBe(1);
        expect(streetMusicianNode?.parents).toEqual([
            { itemId: rockMusician.id, reason: "money-scaler" },
            { itemId: rockMusician.id, reason: "spawner" },
            { itemId: comboNode!.itemId, reason: "combo-ingredient" },
        ]);
    });
});
