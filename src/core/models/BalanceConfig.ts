import { DEFAULT_MAX_SCALING_DEPTH } from "../domain/relations";

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
}

export const DEFAULT_BALANCE_CONFIG: BalanceConfig = {
    depthCoefficients: Object.fromEntries(
        Array.from({ length: DEFAULT_MAX_SCALING_DEPTH + 1 }, (_, depth) => [depth, 0])
    ),
    scaleChelAppearanceProbability: 0,
};
