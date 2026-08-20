/** The three item tables, which is also what an item's `itemType` holds. */
export type ItemKind = "Card" | "House" | "Artefact";

export const ITEM_KINDS: ItemKind[] = ["Card", "House", "Artefact"];

/**
 * Real Cards/Houses/Artefacts columns (from ~/Загрузки/PoD_config/, not guessed), minus ItemId/Tags/PossibleColors
 * — those three get their own dedicated controls wherever an item is edited (id identifies the row; Tags and
 * PossibleColors are EnumMultiSelect over ItemTag/TargetColor respectively), not this generic per-field list.
 */
export const ITEM_CATEGORY_COLUMNS: Record<ItemKind, string[]> = {
    Card: [
        "Weight", "Cost", "ValueMin", "ValueMax", "MoneyValue", "ValueUsageType",
        "Overheat", "Indestructible", "MetaTag", "Rarity", "CardSpriteName", "CardSpriteNameMini", "RarityVFX",
    ],
    House: [
        "Weight", "Cost", "ValueMin", "ValueMax", "MoneyValue", "ValueUsageType",
        "Overheat", "Indestructible", "MetaTag", "Rarity", "CardSpriteName", "CardSpriteNameMini", "SoundId", "Колода", "Act",
    ],
    Artefact: [
        "Weight", "Cost", "ValueMin", "ValueMax", "MoneyValue", "ValueUsageType",
        "MetaTag", "Rarity", "ArtefactAssetName", "комментарий",
    ],
};
