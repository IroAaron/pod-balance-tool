import { createContext, type ReactNode } from "react";
import { store } from "../../core/store";

// eslint-disable-next-line react-refresh/only-export-components
export const StoreContext = createContext(store);

type Props = {
    children: ReactNode;
};

export function StoreProvider({ children }: Props) {
    return (
        <StoreContext.Provider value={store}>
            {children}
        </StoreContext.Provider>
    );
}