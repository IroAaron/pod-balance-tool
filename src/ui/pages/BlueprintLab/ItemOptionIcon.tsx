import { Typography } from "@mui/material";
import { useStore } from "../../hooks/useStore";
import ItemIcon from "../../components/ItemIcon";
import type { ItemOption } from "./ItemRegistryContext";

/** Real sprite/emoji for a "real" Предметы option; a plain placeholder for a canvas-only draft (no sprite data exists yet). */
export default function ItemOptionIcon({ option }: { option: ItemOption }) {
    const store = useStore();
    const realItem = option.source === "real" ? store.getItem(option.id) : undefined;

    if (realItem) {
        return <ItemIcon item={realItem} size={24} />;
    }

    return (
        <Typography sx={{ fontSize: 18, lineHeight: 1, width: 24, textAlign: "center", flexShrink: 0 }}>🧩</Typography>
    );
}
