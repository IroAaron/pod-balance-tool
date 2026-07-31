export interface NavigationMenuItem {
    text: string;

    path: string;

    icon: string;
}

export interface NavigationMenuGroup {
    text: string;

    icon: string;

    children: NavigationMenuItem[];
}

export type NavigationMenuEntry = NavigationMenuItem | NavigationMenuGroup;

export function isNavigationMenuGroup(entry: NavigationMenuEntry): entry is NavigationMenuGroup {
    return "children" in entry;
}

export const menu: NavigationMenuEntry[] = [
    { text: "Источники", path: "/sources", icon: "📥" },
    {
        text: "Контент",
        icon: "🗂️",
        children: [
            { text: "Предметы", path: "/items", icon: "📦" },
            { text: "Раунды", path: "/rounds", icon: "🎯" },
            { text: "Колоды", path: "/decks", icon: "🎴" },
        ],
    },
    {
        text: "Баланс",
        icon: "⚖️",
        children: [
            { text: "Билды", path: "/builds", icon: "🧠" },
            { text: "Граф", path: "/graph", icon: "🕸" },
            { text: "Сила предметов", path: "/balance", icon: "💪" },
        ],
    },
    {
        text: "Другое",
        icon: "🔧",
        children: [
            { text: "Глоссарий", path: "/glossary", icon: "📖" },
            { text: "Разное", path: "/analytics", icon: "📊" },
            { text: "Настройки текста", path: "/settings", icon: "⚙️" },
        ],
    },
    { text: "Сохранения", path: "/saves", icon: "💾" },
    { text: "Blueprint-лаборатория", path: "/blueprint-lab", icon: "🧪" },
];
