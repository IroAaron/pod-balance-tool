import { useContext } from "react";
import { StoreContext } from "../providers/StoreProvider";

export function useStore() {
    return useContext(StoreContext);
}