import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../../hooks/useStore";
import { DEFAULT_ENUM_VALUES, DEFAULT_DIMENSION_DESCRIPTIONS, DEFAULT_VALUE_DESCRIPTIONS } from "./enumData";

interface EnumRegistry {
    values: Record<string, string[]>;
    /** Which dimensions the imported Enums sheet actually supplied, so the UI can say where a list came from. */
    sheetBackedDimensions: Set<string>;
    /** Per-dimension phrase — "what is this dropdown for" (shown on the control itself). */
    descriptions: Record<string, string>;
    /** Per-dimension, per-value phrase — "what does this specific option mean" (shown per list item). */
    valueDescriptions: Record<string, Record<string, string>>;
    addValue: (dimension: string, value: string) => void;
    removeValue: (dimension: string, value: string) => void;
    setDescription: (dimension: string, description: string) => void;
    setValueDescription: (dimension: string, value: string, description: string) => void;
}

/**
 * Columns of the Enums tab that aren't parameter enums. `ItemId` there is a formula gathering every id from the
 * item tables — a 300-entry list that no dropdown wants, and the project owner asked for it to stay out.
 */
const IGNORED_SHEET_DIMENSIONS = new Set(["ItemId"]);

const EnumRegistryContext = createContext<EnumRegistry | null>(null);

export function EnumRegistryProvider({ children }: { children: ReactNode }) {
    const store = useStore();
    // Local edits are kept apart from the imported data rather than baked into one list, so a re-import of the
    // Enums sheet keeps winning for the values it owns instead of being frozen at whatever was first loaded.
    const [added, setAdded] = useState<Record<string, string[]>>({});
    const [removed, setRemoved] = useState<Record<string, string[]>>({});
    const [descriptionEdits, setDescriptionEdits] = useState<Record<string, string>>({});
    const [valueDescriptionEdits, setValueDescriptionEdits] = useState<Record<string, Record<string, string>>>({});

    /**
     * The real `Enums` tab is the source of truth — it's already imported into store.enumValues, so hardcoding
     * these lists would mean maintaining a second copy that silently drifts. The bundled defaults only fill in
     * dimensions that tab genuinely doesn't have (ItemMech/TagMech/TargetGetter, confirmed against the real
     * mechanic CSVs) and cover the case where nothing has been imported yet.
     */
    const values = useMemo(() => {
        const merged: Record<string, string[]> = { ...DEFAULT_ENUM_VALUES };

        for (const [dimension, sheetValues] of Object.entries(store.enumValues)) {
            if (IGNORED_SHEET_DIMENSIONS.has(dimension)) continue;
            if (sheetValues.length > 0) merged[dimension] = sheetValues;
        }
        for (const [dimension, extra] of Object.entries(added)) {
            merged[dimension] = [...new Set([...(merged[dimension] ?? []), ...extra])];
        }
        for (const [dimension, gone] of Object.entries(removed)) {
            merged[dimension] = (merged[dimension] ?? []).filter((value) => !gone.includes(value));
        }

        return merged;
    }, [store.enumValues, added, removed]);

    const sheetBackedDimensions = useMemo(
        () =>
            new Set(
                Object.entries(store.enumValues)
                    .filter(([name, list]) => list.length > 0 && !IGNORED_SHEET_DIMENSIONS.has(name))
                    .map(([name]) => name)
            ),
        [store.enumValues]
    );

    const descriptions = useMemo(
        () => ({ ...DEFAULT_DIMENSION_DESCRIPTIONS, ...descriptionEdits }),
        [descriptionEdits]
    );

    const valueDescriptions = useMemo(() => {
        const merged: Record<string, Record<string, string>> = {};
        for (const [dimension, entries] of Object.entries(DEFAULT_VALUE_DESCRIPTIONS)) merged[dimension] = { ...entries };
        for (const [dimension, entries] of Object.entries(valueDescriptionEdits)) {
            merged[dimension] = { ...(merged[dimension] ?? {}), ...entries };
        }
        return merged;
    }, [valueDescriptionEdits]);

    const addValue = useCallback((dimension: string, value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        setAdded((cur) => ({ ...cur, [dimension]: [...new Set([...(cur[dimension] ?? []), trimmed])] }));
        setRemoved((cur) => ({ ...cur, [dimension]: (cur[dimension] ?? []).filter((v) => v !== trimmed) }));
    }, []);

    const removeValue = useCallback((dimension: string, value: string) => {
        setAdded((cur) => ({ ...cur, [dimension]: (cur[dimension] ?? []).filter((v) => v !== value) }));
        setRemoved((cur) => ({ ...cur, [dimension]: [...new Set([...(cur[dimension] ?? []), value])] }));
    }, []);

    const setDescription = useCallback((dimension: string, description: string) => {
        setDescriptionEdits((cur) => ({ ...cur, [dimension]: description }));
    }, []);

    const setValueDescription = useCallback((dimension: string, value: string, description: string) => {
        setValueDescriptionEdits((cur) => ({
            ...cur,
            [dimension]: { ...(cur[dimension] ?? {}), [value]: description },
        }));
    }, []);

    const registry = useMemo(
        () => ({
            values,
            sheetBackedDimensions,
            descriptions,
            valueDescriptions,
            addValue,
            removeValue,
            setDescription,
            setValueDescription,
        }),
        [
            values,
            sheetBackedDimensions,
            descriptions,
            valueDescriptions,
            addValue,
            removeValue,
            setDescription,
            setValueDescription,
        ]
    );

    return <EnumRegistryContext.Provider value={registry}>{children}</EnumRegistryContext.Provider>;
}

export function useEnumRegistry(): EnumRegistry {
    const ctx = useContext(EnumRegistryContext);
    if (!ctx) throw new Error("useEnumRegistry must be used within an EnumRegistryProvider");
    return ctx;
}
