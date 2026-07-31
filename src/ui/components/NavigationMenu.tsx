export interface NavigationMenuItem {
    text: string;

    path: string;

    icon: string;
}

export const menu: NavigationMenuItem[] = [
    { text: "Источники", path: "/sources", icon: "📥" },
    { text: "Предметы", path: "/items", icon: "📦" },
    { text: "Билды", path: "/builds", icon: "🧠" },
    { text: "Глоссарий", path: "/glossary", icon: "📖" },
    { text: "Граф", path: "/graph", icon: "🕸" },
    { text: "Баланс", path: "/balance", icon: "⚖️" },
    { text: "Аналитика", path: "/analytics", icon: "📊" },
    { text: "Сохранения", path: "/saves", icon: "💾" },
    { text: "Настройки", path: "/settings", icon: "⚙️" },
    { text: "Blueprint-лаборатория", path: "/blueprint-lab", icon: "🧪" },
];
