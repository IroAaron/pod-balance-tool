export interface NavigationMenuItem {
    text: string;

    path: string;

    icon: string;
}

export const menu: NavigationMenuItem[] = [
    { text: "Источники", path: "/sources", icon: "📥" },
    { text: "Предметы", path: "/items", icon: "📦" },
    { text: "Билды", path: "/builds", icon: "🧠" },
    { text: "Граф", path: "/graph", icon: "🕸" },
    { text: "Аналитика", path: "/analytics", icon: "📊" },
    { text: "Настройки", path: "/settings", icon: "⚙️" },
];
