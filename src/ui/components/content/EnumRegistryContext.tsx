import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_ENUM_VALUES, DEFAULT_DIMENSION_DESCRIPTIONS, DEFAULT_VALUE_DESCRIPTIONS } from "./enumData";

interface EnumRegistry {
    values: Record<string, string[]>;
    /** Per-dimension phrase — "what is this dropdown for" (shown on the control itself). */
    descriptions: Record<string, string>;
    /** Per-dimension, per-value phrase — "what does this specific option mean" (shown per list item). */
    valueDescriptions: Record<string, Record<string, string>>;
    addValue: (dimension: string, value: string) => void;
    removeValue: (dimension: string, value: string) => void;
    setDescription: (dimension: string, description: string) => void;
    setValueDescription: (dimension: string, value: string, description: string) => void;
}

const EnumRegistryContext = createContext<EnumRegistry | null>(null);

export function EnumRegistryProvider({ children }: { children: ReactNode }) {
    const [values, setValues] = useState<Record<string, string[]>>(DEFAULT_ENUM_VALUES);
    const [descriptions, setDescriptions] = useState<Record<string, string>>(DEFAULT_DIMENSION_DESCRIPTIONS);
    const [valueDescriptions, setValueDescriptions] = useState<Record<string, Record<string, string>>>(
        DEFAULT_VALUE_DESCRIPTIONS,
    );

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

    const setDescription = useCallback((dimension: string, description: string) => {
        setDescriptions((cur) => ({ ...cur, [dimension]: description }));
    }, []);

    const setValueDescription = useCallback((dimension: string, value: string, description: string) => {
        setValueDescriptions((cur) => ({
            ...cur,
            [dimension]: { ...(cur[dimension] ?? {}), [value]: description },
        }));
    }, []);

    const registry = useMemo(
        () => ({ values, descriptions, valueDescriptions, addValue, removeValue, setDescription, setValueDescription }),
        [values, descriptions, valueDescriptions, addValue, removeValue, setDescription, setValueDescription],
    );

    return <EnumRegistryContext.Provider value={registry}>{children}</EnumRegistryContext.Provider>;
}

export function useEnumRegistry(): EnumRegistry {
    const ctx = useContext(EnumRegistryContext);
    if (!ctx) throw new Error("useEnumRegistry must be used within an EnumRegistryProvider");
    return ctx;
}
