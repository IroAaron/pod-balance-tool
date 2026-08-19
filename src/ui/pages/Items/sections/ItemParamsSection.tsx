import { Box, Typography } from "@mui/material";
import { useStore } from "../../../hooks/useStore";
import EnumField from "../../../components/content/EnumField";
import EnumMultiSelect from "../../../components/content/EnumMultiSelect";
import SpriteSelect, { isSpriteField } from "../../../components/content/SpriteSelect";
import { ITEM_CATEGORY_COLUMNS, type ItemKind } from "../../../components/content/itemSchema";
import SectionPaper from "./SectionPaper";
import CopyToUpgradesButton from "./CopyToUpgradesButton";
import type { Item } from "../../../../core/models/Item";

/** Comma-separated cell (PossibleColors) <-> the multi-select's array, matching normalize.ts's own splitting. */
function splitList(value: string | undefined): string[] {
    return (value ?? "")
        .split(/[|,;]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export default function ItemParamsSection({ item }: { item: Item }) {
    const store = useStore();
    const itemType = (item.itemType as ItemKind) ?? "Card";
    const columns = ITEM_CATEGORY_COLUMNS[itemType] ?? ITEM_CATEGORY_COLUMNS.Card;

    const setColumn = (column: string, value: string) =>
        store.upsertItem(item.id, itemType, { raw: { [column]: value } });

    return (
        <SectionPaper
            title={`Параметры${item.itemType ? ` (${item.itemType})` : ""}`}
            actions={
                <CopyToUpgradesButton
                    item={item}
                    what="параметры"
                    description="Все параметры этого предмета заменят параметры его прокачек."
                    warning={
                        <>
                            Это перезапишет и числа баланса прокачек — <code>ValueMin</code>, <code>ValueMax</code>,{" "}
                            <code>MoneyValue</code>, <code>Cost</code>, <code>Weight</code>. Обычно как раз они и
                            должны отличаться у прокачек.
                        </>
                    }
                    onCopy={() => store.copyParamsToUpgrades(item.id)}
                />
            }
        >
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 2,
                }}
            >
                <EnumMultiSelect
                    dimension="TargetColor"
                    label="PossibleColors"
                    value={splitList(item.raw.PossibleColors)}
                    onChange={(colors) => setColumn("PossibleColors", colors.join(", "))}
                />

                {columns.map((column) =>
                    isSpriteField(column) ? (
                        <SpriteSelect
                            key={column}
                            field={column}
                            value={item.raw[column] ?? ""}
                            onChange={(value) => setColumn(column, value)}
                        />
                    ) : (
                        <EnumField
                            key={column}
                            field={column}
                            value={item.raw[column] ?? ""}
                            onChange={(value) => setColumn(column, value)}
                        />
                    )
                )}
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                Колонки таблицы {itemType === "Card" ? "Cards" : itemType === "House" ? "Houses" : "Artefacts"}.
                Изменения сразу видны на сайте; в таблицу они уйдут при экспорте на странице «Источники».
            </Typography>
        </SectionPaper>
    );
}
