import { useState } from "react";
import { Typography } from "@mui/material";
import { useStore } from "../hooks/useStore";
import { getItemSpritePath } from "../../core/domain/sprites";
import type { Item } from "../../core/models/Item";

type Props = {
    item: Item;

    size?: number;
};

/** A manually-set emoji override always wins; otherwise the real sprite is shown, falling back to a placeholder emoji if there's no sprite or it fails to load. */
export default function ItemIcon({ item, size = 40 }: Props) {
    const store = useStore();
    const [spriteFailed, setSpriteFailed] = useState(false);

    const customIcon = store.getItemIcon(item.id);
    const spritePath = getItemSpritePath(item);

    if (!customIcon && spritePath && !spriteFailed) {
        return (
            <img
                src={spritePath}
                alt={store.itemName(item)}
                width={size}
                height={size}
                style={{ objectFit: "contain", display: "block" }}
                onError={() => setSpriteFailed(true)}
            />
        );
    }

    return <Typography sx={{ fontSize: size * 0.8, lineHeight: 1 }}>{customIcon ?? "🧩"}</Typography>;
}
