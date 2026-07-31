import { createContext, useContext, type ReactNode } from "react";

export interface ItemOption {
    id: string;
    name: string;
    /** "real" = already in the site's Предметы database, "canvas" = drafted here and not saved anywhere yet. */
    source: "real" | "canvas";
}

const ItemRegistryContext = createContext<ItemOption[]>([]);

export function ItemRegistryProvider({ items, children }: { items: ItemOption[]; children: ReactNode }) {
    return <ItemRegistryContext.Provider value={items}>{children}</ItemRegistryContext.Provider>;
}

/** Combined list of real Предметы (from the site's GameStore) and Item nodes drafted on this canvas. */
export function useItemRegistry(): ItemOption[] {
    return useContext(ItemRegistryContext);
}
