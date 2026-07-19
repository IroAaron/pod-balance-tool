import { Typography } from "@mui/material";
import { useStore } from "../hooks/useStore";
import ItemIcon from "./ItemIcon";
import type { Build } from "../../core/models/Build";

type Props = {
    build: Build;

    size?: number;
};

/**
 * A manually-set build.icon always wins (the "Иконка" field on /builds/:id); otherwise falls back to the root
 * item's (build.items[0]) own icon — same priority ItemIcon already uses for items: manual item emoji override,
 * then the item's real sprite, then a placeholder emoji. "🧠" only when there's no build icon and no root item to
 * fall back to (an empty build).
 */
export default function BuildIcon({ build, size = 40 }: Props) {
    const store = useStore();

    if (build.icon) {
        return <Typography sx={{ fontSize: size * 0.8, lineHeight: 1 }}>{build.icon}</Typography>;
    }

    const rootItem = build.items.length > 0 ? store.getItem(build.items[0]) : undefined;
    if (rootItem) {
        return <ItemIcon item={rootItem} size={size} />;
    }

    return <Typography sx={{ fontSize: size * 0.8, lineHeight: 1 }}>🧠</Typography>;
}
