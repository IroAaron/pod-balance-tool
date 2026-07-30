import { DEFAULT_MAX_SCALING_DEPTH } from "../domain/relations";
import { KNOWN_MECHANIC_TABLES } from "../domain/mechanicTables";

/**
 * User-entered balance constants — see BalancePage's "Константы" tab. `depthCoefficients` is keyed by the same
 * `depth` computeScalingGraph/computeCascadeLevels assign to a build member (0 = the build's own root item, up to
 * DEFAULT_MAX_SCALING_DEPTH — real generation never produces a deeper node than that, so there's no need for more
 * rows than this). Object keys are always strings once round-tripped through JSON/Firestore — read with
 * `config.depthCoefficients[depth]`, JS coerces the numeric depth to a string key automatically.
 */
export interface BalanceConfig {
    depthCoefficients: Record<number, number>;

    /** P — probability that a "scaling chel" (character) appears, used directly in the item power formula. */
    scaleChelAppearanceProbability: number;

    /** Per-mechanic-table "influence" weight, keyed by MechanicTableName ("MechAddValue", "MechActivate", ...) —
     *  see domain/balance.ts's computeItemPowers "mechanic power" formula. Lets an item with no MinValue/MaxValue
     *  at all (so 0 in the original power formula) still register as useful/strong when it activates a lot of
     *  other things. */
    mechanicInfluence: Record<string, number>;

    /** N — depth threshold ("не ниже N ступени") for the main power formula's build set S: only builds where the
     *  examined item's own depth is ≤ N count. See domain/balance.ts's computeItemPowers doc. Defaults to
     *  DEFAULT_MAX_SCALING_DEPTH so S starts out as "every build the item is in" (real generation never produces
     *  a deeper node), narrowed down from there by the user. */
    qualifyingBuildDepthThreshold: number;
}

export const DEFAULT_BALANCE_CONFIG: BalanceConfig = {
    depthCoefficients: Object.fromEntries(
        Array.from({ length: DEFAULT_MAX_SCALING_DEPTH + 1 }, (_, depth) => [depth, 0])
    ),
    scaleChelAppearanceProbability: 0,
    mechanicInfluence: Object.fromEntries(KNOWN_MECHANIC_TABLES.map((table) => [table, 0])),
    qualifyingBuildDepthThreshold: DEFAULT_MAX_SCALING_DEPTH,
};
