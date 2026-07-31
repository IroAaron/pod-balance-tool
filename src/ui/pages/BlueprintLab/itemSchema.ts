import type { ItemKind } from "./types";

/**
 * Real Cards/Houses/Artefacts columns (from ~/Загрузки/PoD_config/, not guessed), minus ItemId/Tags/PossibleColors
 * — those three render through their own dedicated controls in ItemNode (id is the node itself; Tags and
 * PossibleColors are EnumMultiSelect over ItemTag/TargetColor respectively), not this generic per-field list.
 */
export const ITEM_CATEGORY_COLUMNS: Record<ItemKind, string[]> = {
    Card: [
        "Weight", "Cost", "ValueMin", "ValueMax", "MoneyValue", "ValueUsageType",
        "Overheat", "Indestructible", "MetaTag", "CardSpriteName", "CardSpriteNameMini", "RarityVFX",
    ],
    House: [
        "Weight", "Cost", "ValueMin", "ValueMax", "MoneyValue", "ValueUsageType",
        "Overheat", "Indestructible", "MetaTag", "CardSpriteName", "CardSpriteNameMini", "SoundId", "Колода", "Act",
    ],
    Artefact: [
        "Weight", "Cost", "ValueMin", "ValueMax", "MoneyValue", "ValueUsageType",
        "MetaTag", "ArtefactAssetName", "комментарий",
    ],
};
