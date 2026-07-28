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

/**
 * Short phrase per dimension — shown as a tooltip on the dropdown control itself ("what is this dropdown for").
 * These are safe, structural descriptions of the dimension's role, not guesses about specific gameplay values.
 */
export const DEFAULT_DIMENSION_DESCRIPTIONS: Record<string, string> = {
    ItemType: "категория предмета/цели",
    TargetColor: "цвет карты",
    Place: "положение на поле",
    ActivatorType: "какое событие запускает механику",
    ItemTag: "тег предмета",
    ValueUsageType: "как применить значение",
    BonusCountingType: "что именно считать для бонуса",
    DurationType: "на что действует длительность",
    ValueTypes: "какое значение игрока меняется",
    ItemMech: "поставить или удалить предмет",
    TagMech: "дать или забрать тег",
    TargetGetter: "как прочитать значение цели",
};

/**
 * Short phrase per value — shown as a tooltip when hovering that option in the open dropdown list.
 * Only seeded where the value's meaning is unambiguous from its name alone (spatial terms, colors, math
 * operations, the two confirmed поставить/удалить-style pairs). Left empty for ItemType/ItemTag/BonusCountingType,
 * whose real per-value gameplay meaning isn't safely guessable from the CSV alone — fill those in via the
 * Enum panel once known, rather than trust an invented description.
 */
export const DEFAULT_VALUE_DESCRIPTIONS: Record<string, Record<string, string>> = {
    Place: {
        Near: "рядом с активатором",
        NearBall: "рядом с мячом",
        MyPosition: "на своей позиции",
        SameSide: "на той же стороне",
        OppositeSide: "на противоположной стороне",
        OppositeCard: "на противоположной карте",
        OppositeCell: "в противоположной ячейке",
        DifferentSide: "на другой стороне",
        RandomSide: "на случайной стороне",
        All: "где угодно",
        Road: "на дороге",
        Corner: "в углу",
        LoopCompleted: "после завершения круга",
        SideLeft: "слева",
        SideRight: "справа",
        SideUp: "сверху",
        SideDown: "снизу",
        CornerLeftUp: "левый верхний угол",
        CornerLeftDown: "левый нижний угол",
        CornerRightUp: "правый верхний угол",
        CornerRightDown: "правый нижний угол",
    },
    TargetColor: {
        Same: "тот же цвет",
        NotSame: "другой цвет",
        Random: "случайный цвет",
        NoColor: "без цвета",
        Red: "красный",
        Blue: "синий",
        Green: "зелёный",
        Yellow: "жёлтый",
        Gray: "серый",
        Dark: "тёмный",
    },
    ActivatorType: {
        BallPass: "мяч прошёл",
        BallStop: "мяч остановился",
        BallStart: "мяч запущен",
        BallInertia: "мяч движется по инерции",
        BallInertiaStart: "инерция мяча началась",
        ColorChange: "у карты сменился цвет",
        ItemPlaced: "предмет поставлен",
        ItemRemoved: "предмет удалён",
        ItemActivated: "предмет активировался",
        ItemOverheated: "предмет перегрелся",
        ItemOrCellActivated: "предмет или ячейка активировались",
        CellActivated: "ячейка активировалась",
        LoopCompleted: "круг завершён",
    },
    ValueUsageType: {
        addition: "прибавить",
        subtraction: "вычесть",
        multiplication: "умножить",
        division: "разделить",
        setter: "заменить значение",
    },
    DurationType: {
        Round: "на раунд",
        Spin: "на один спин",
        Activations: "на число активаций",
        LoopCompleted: "до завершения круга",
    },
    ValueTypes: {
        MainValue: "основное значение",
        MoneyValue: "денежное значение",
    },
    ItemMech: {
        "поставить": "разместить предмет",
        "удалить": "убрать предмет",
    },
    TagMech: {
        "дать": "выдать тег",
        "удалить": "снять тег",
    },
    TargetGetter: {
        "забрать value": "значение переходит и обнуляется у цели",
        "прочитать value": "значение считывается, у цели не меняется",
    },
};
