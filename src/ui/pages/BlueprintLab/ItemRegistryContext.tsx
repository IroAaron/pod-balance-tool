import { createContext, useContext, type ReactNode } from "react";

export interface ItemOption {
    id: string;
    name: string;
}

const ItemRegistryContext = createContext<ItemOption[]>([]);

export function ItemRegistryProvider({ items, children }: { items: ItemOption[]; children: ReactNode }) {
    return <ItemRegistryContext.Provider value={items}>{children}</ItemRegistryContext.Provider>;
}

/** Live list of Item nodes currently on the canvas, searchable by name or id (see ItemRefSelect). */
export function useItemRegistry(): ItemOption[] {
    return useContext(ItemRegistryContext);
}
