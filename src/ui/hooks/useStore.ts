import { useContext, useSyncExternalStore } from "react";
import { StoreContext } from "../providers/StoreProvider";
import type { GameStore } from "../../core/GameStore";

export function useStore(): GameStore {
    const store = useContext(StoreContext);

    useSyncExternalStore(store.subscribe, () => store.version);

    return store;
}
