import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_ENUM_VALUES } from "./enumData";

interface EnumRegistry {
    values: Record<string, string[]>;
    addValue: (dimension: string, value: string) => void;
    removeValue: (dimension: string, value: string) => void;
}

const EnumRegistryContext = createContext<EnumRegistry | null>(null);

export function EnumRegistryProvider({ children }: { children: ReactNode }) {
    const [values, setValues] = useState<Record<string, string[]>>(DEFAULT_ENUM_VALUES);

    const addValue = useCallback((dimension: string, value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        setValues((cur) => {
            const existing = cur[dimension] ?? [];
            if (existing.includes(trimmed)) return cur;
            return { ...cur, [dimension]: [...existing, trimmed] };
        });
    }, []);

    const removeValue = useCallback((dimension: string, value: string) => {
        setValues((cur) => ({ ...cur, [dimension]: (cur[dimension] ?? []).filter((v) => v !== value) }));
    }, []);

    const registry = useMemo(() => ({ values, addValue, removeValue }), [values, addValue, removeValue]);

    return <EnumRegistryContext.Provider value={registry}>{children}</EnumRegistryContext.Provider>;
}

export function useEnumRegistry(): EnumRegistry {
    const ctx = useContext(EnumRegistryContext);
    if (!ctx) throw new Error("useEnumRegistry must be used within an EnumRegistryProvider");
    return ctx;
}
