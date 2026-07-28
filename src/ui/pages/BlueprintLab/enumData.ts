/**
 * Seed values for the lab's Enum registry, pulled from the real production "Enums" sheet
 * (PoD_config export) plus a few mechanic-specific value sets that aren't in that sheet at all
 * (ItemMech/TagMech/TargetGetter — confirmed instead straight from the real MechAddItem/MechAddTag/
 * MechAddValue rows, since the actual Enums tab has no column for them). Editable at runtime via
 * the Enum panel — this is only a starting point, not a hardcoded contract.
 */
export const DEFAULT_ENUM_VALUES: Record<string, string[]> = {
    ItemType: [
        "All", "Ball", "Card", "Heat", "HeatLimit", "House", "HouseAllPlaces", "HouseEmptyPlaces",
        "ItemHeat", "LoopComplitedCounter", "NotRoad", "PlayerScore", "Road", "RunDirection",
        "RunRemained", "RunRemainedDir",
    ],
    TargetColor: ["Blue", "Dark", "Gray", "Green", "NoColor", "NotSame", "Random", "Red", "Same", "Yellow"],
    Place: [
        "All", "Corner", "CornerLeftDown", "CornerLeftUp", "CornerRightDown", "CornerRightUp",
        "DifferentSide", "LoopCompleted", "MyPosition", "Near", "NearBall", "OppositeCard",
        "OppositeCell", "OppositeSide", "RandomSide", "Road", "SameSide", "SideDown", "SideLeft",
        "SideRight", "SideUp",
    ],
    ActivatorType: [
        "BallInertia", "BallInertiaStart", "BallPass", "BallStart", "BallStop", "CellActivated",
        "ColorChange", "ItemActivated", "ItemOrCellActivated", "ItemOverheated", "ItemPlaced",
        "ItemRemoved", "LoopCompleted",
    ],
    ItemTag: [
        "Art", "Bank", "Building", "Bum", "Collector", "Crazy", "Criminal", "Entertainment", "Faith",
        "Farmer", "Finance", "Food", "Judge", "Lawyer", "Logistics", "Man", "Maniac", "Media",
        "Military", "Model", "Music", "Musician", "Photographer", "Police", "Prisoner", "Producer",
        "Prostitute", "ProstoChel", "Rich", "Rock", "Same", "Show business", "Soccer", "Sport",
        "Start Chel", "Woman", "c_pension", "c_server", "corner", "team",
    ],
    ValueUsageType: ["addition", "division", "multiplication", "setter", "subtraction"],
    BonusCountingType: ["CellCount", "CellValue", "FullCellCount", "ItemCount", "ItemMoneyValue", "ItemValue", "NullCellCount"],
    DurationType: ["Activations", "LoopCompleted", "Round", "Spin"],
    ValueTypes: ["MainValue", "MoneyValue"],
    ItemMech: ["поставить", "удалить"],
    TagMech: ["дать", "удалить"],
    TargetGetter: ["забрать value", "прочитать value"],
};

/** Raw mechanic-table column name -> Enum registry dimension it draws its dropdown options from. */
export const FIELD_TO_DIMENSION: Record<string, string> = {
    ActivatorType: "ActivatorType",
    ActivatorTargetType: "ItemType",
    ActivatorPlace: "Place",
    ActivatorColor: "TargetColor",
    ActivatorTag: "ItemTag",
    ActivatorValueUsageType: "ValueUsageType",
    TargetType: "ItemType",
    TargetValueType: "ValueTypes",
    TargetPlace: "Place",
    TargetColor: "TargetColor",
    TargetTag: "ItemTag",
    TargetValueUsageType: "ValueUsageType",
    TargetGetter: "TargetGetter",
    BonusCountingType: "BonusCountingType",
    BonusUsageType: "ValueUsageType",
    BonusValueUsageType: "ValueUsageType",
    BonusTargetType: "ItemType",
    BonusTargetPlace: "Place",
    BonusTargetColor: "TargetColor",
    BonusTargetTag: "ItemTag",
    NewColor: "TargetColor",
    ItemMech: "ItemMech",
    CopiedTargetType: "ItemType",
    CopiedTargetPlace: "Place",
    CopiedTargetColor: "TargetColor",
    CopiedTargetTag: "ItemTag",
    CopiedTargetValueUsageType: "ValueUsageType",
    TagMech: "TagMech",
    NewTags: "ItemTag",
    MyPositionReq: "Place",
};

export const ENUM_DIMENSIONS = Object.keys(DEFAULT_ENUM_VALUES);
