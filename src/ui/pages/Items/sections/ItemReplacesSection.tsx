import { useState } from "react";
import { Box, Button, IconButton, Menu, MenuItem, Paper, Stack, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useStore } from "../../../hooks/useStore";
import EnumField from "../../../components/content/EnumField";
import ItemRefSelect from "../../../components/content/ItemRefSelect";
import SectionPaper from "./SectionPaper";
import type { Item } from "../../../../core/models/Item";
import type { ReplaceRule, ReplaceRuleSource } from "../../../../core/models/ReplaceRule";

/** Real columns of each table, minus ItemIdToReplace/ReplacementItem which get their own item pickers. */
const EXTRA_COLUMNS: Record<ReplaceRuleSource, string[]> = {
    ReplaceItem: ["NeededItem", "NeededItemPlace", "NeededItemNumber"],
    ReplaceOnTrigger: ["ReplacementItemsTagForName", "OnballStop", "DurationType", "Duration"],
};

/** These two name real items, so they get the searchable picker rather than a free-text box. */
const ITEM_REF_COLUMNS = new Set(["NeededItem"]);

function RuleCard({ rule, onChange, onDelete }: { rule: ReplaceRule; onChange: (next: ReplaceRule) => void; onDelete: () => void }) {
    const setField = (field: string, value: string) =>
        onChange({ ...rule, fields: { ...rule.fields, [field]: value } });

    return (
        <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                    <Typography variant="subtitle2">{rule.source}</Typography>
                    <Tooltip title="Удалить правило">
                        <IconButton size="small" color="error" onClick={onDelete} aria-label="Удалить правило">
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                        gap: 2,
                    }}
                >
                    <ItemRefSelect
                        field="ReplacementItem"
                        value={rule.replacementItem}
                        onChange={(value) => onChange({ ...rule, replacementItem: value })}
                    />
                    {EXTRA_COLUMNS[rule.source].map((column) =>
                        ITEM_REF_COLUMNS.has(column) ? (
                            <ItemRefSelect
                                key={column}
                                field={column}
                                value={rule.fields[column] ?? ""}
                                onChange={(value) => setField(column, value)}
                            />
                        ) : (
                            <EnumField
                                key={column}
                                field={column}
                                value={rule.fields[column] ?? ""}
                                onChange={(value) => setField(column, value)}
                            />
                        )
                    )}
                </Box>
            </Stack>
        </Paper>
    );
}

export default function ItemReplacesSection({ item }: { item: Item }) {
    const store = useStore();
    const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);

    const rules = store.replaceRules.filter((rule) => rule.itemIdToReplace === item.id);
    const replacedFrom = store.replaceRules.filter((rule) => rule.replacementItem === item.id);

    const addRule = (source: ReplaceRuleSource) => {
        store.upsertReplaceRule({
            id: `content:replace:${source}:${item.id}:${Date.now()}`,
            source,
            itemIdToReplace: item.id,
            replacementItem: "",
            fields: {},
        });
        setAddAnchor(null);
    };

    return (
        <SectionPaper
            title={`Замены (${rules.length})`}
            actions={
                <>
                    <Button size="small" startIcon={<AddIcon />} onClick={(e) => setAddAnchor(e.currentTarget)}>
                        Добавить
                    </Button>
                    <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
                        <MenuItem onClick={() => addRule("ReplaceItem")}>ReplaceItem</MenuItem>
                        <MenuItem onClick={() => addRule("ReplaceOnTrigger")}>ReplaceOnTrigger</MenuItem>
                    </Menu>
                </>
            }
        >
            <Stack spacing={2}>
                {rules.length === 0 ? (
                    <Typography color="text.secondary">Этот предмет ни во что не превращается.</Typography>
                ) : (
                    rules.map((rule) => (
                        <RuleCard
                            key={rule.id}
                            rule={rule}
                            onChange={(next) => store.upsertReplaceRule(next)}
                            onDelete={() => store.deleteReplaceRule(rule.id)}
                        />
                    ))
                )}

                {replacedFrom.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Получается заменой из
                        </Typography>
                        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                            {replacedFrom.map((rule) => {
                                const source = store.getItem(rule.itemIdToReplace);
                                return (
                                    <Typography key={rule.id} variant="body2" color="text.secondary">
                                        {rule.source}: {source ? store.itemName(source) : rule.itemIdToReplace}
                                    </Typography>
                                );
                            })}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            Эти правила принадлежат другому предмету — редактируются в его карточке.
                        </Typography>
                    </Box>
                )}
            </Stack>
        </SectionPaper>
    );
}
