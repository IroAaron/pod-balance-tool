import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useStore } from "../../hooks/useStore";
import { MECHANIC_KINDS } from "./mechanicSchema";
import { ITEM_CATEGORY_COLUMNS } from "./itemSchema";
import { HANDLE_STYLE } from "./handleStyle";
import EnumField from "./EnumField";
import EnumMultiSelect from "./EnumMultiSelect";
import type { ItemFlowNode, ItemKind } from "./types";

const ITEM_KINDS: ItemKind[] = ["Card", "House", "Artefact"];

export default function ItemNode({ data, selected }: NodeProps<ItemFlowNode>) {
    const [addMechanicOpen, setAddMechanicOpen] = useState(false);
    const [confirmingCopyToUpgrades, setConfirmingCopyToUpgrades] = useState(false);
    const [copyResult, setCopyResult] = useState<string | null>(null);
    const store = useStore();

    // Only a real, loaded item can have upgrade tiers to copy into — a fresh draft isn't in any chain yet.
    const chain = data.locked ? store.chainForItem(data.itemId) : undefined;
    const chainIndex = chain ? chain.itemIds.indexOf(data.itemId) : -1;
    const upgradeTierItems =
        chain && chainIndex !== -1
            ? chain.itemIds.slice(chainIndex + 1).map((tierId) => store.getItem(tierId) ?? tierId)
            : [];
    const ownMechanicCount = store.mechanics.filter((row) => row.itemId === data.itemId).length;

    const copyMechanicsToUpgrades = () => {
        const { tiers, updated, added } = store.copyMechanicsToUpgrades(data.itemId);
        setConfirmingCopyToUpgrades(false);
        setCopyResult(
            updated + added === 0
                ? `Прокачек: ${tiers}. Механики уже совпадают — менять нечего.`
                : `Прокачек: ${tiers}. Обновлено строк: ${updated}, добавлено: ${added}.`
        );
    };

    return (
        <Paper
            variant="outlined"
            sx={{
                width: 260,
                borderColor: selected ? "primary.main" : "divider",
                borderWidth: selected ? 2 : 1,
                overflow: "visible",
            }}
        >
            <Handle type="target" id="ref" position={Position.Left} style={{ top: 24, ...HANDLE_STYLE }} />
            <Handle type="source" id="owns" position={Position.Right} style={{ top: 24, ...HANDLE_STYLE }} />

            <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover", borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    📦 Предмет{data.locked ? " · загружен из «Предметы»" : ""}
                </Typography>
            </Box>

            <Stack spacing={1} sx={{ p: 1.5 }} className="nodrag">
                <TextField
                    size="small"
                    label="ItemId"
                    value={data.itemId}
                    disabled={data.locked}
                    onChange={(e) => data.onChange({ itemId: e.target.value })}
                />

                <TextField
                    size="small"
                    label="Название"
                    disabled={!data.nameKey}
                    helperText={!data.nameKey ? "сначала укажите ItemId" : undefined}
                    value={data.nameKey ? store.getTranslation(data.nameKey) ?? "" : ""}
                    onChange={(e) => store.setTranslationOverride(data.nameKey, e.target.value)}
                />

                <TextField
                    size="small"
                    label="Описание"
                    multiline
                    minRows={2}
                    disabled={!data.descKey}
                    value={data.descKey ? store.getTranslation(data.descKey) ?? "" : ""}
                    onChange={(e) => store.setTranslationOverride(data.descKey, e.target.value)}
                />

                <Select
                    size="small"
                    value={data.itemType}
                    disabled={data.locked}
                    onChange={(e) => data.onChange({ itemType: e.target.value as ItemKind })}
                >
                    {ITEM_KINDS.map((kind) => (
                        <MenuItem key={kind} value={kind}>
                            {kind}
                        </MenuItem>
                    ))}
                </Select>

                <EnumMultiSelect dimension="ItemTag" label="Теги" value={data.tags} onChange={(tags) => data.onChange({ tags })} />
                <EnumMultiSelect
                    dimension="TargetColor"
                    label="Возможные цвета"
                    value={data.possibleColors}
                    onChange={(possibleColors) => data.onChange({ possibleColors })}
                />

                {ITEM_CATEGORY_COLUMNS[data.itemType].map((field) => (
                    <EnumField
                        key={field}
                        field={field}
                        value={data.rawFields[field] ?? ""}
                        onChange={(value) => data.onRawFieldChange(field, value)}
                    />
                ))}

                <Select
                    size="small"
                    displayEmpty
                    value=""
                    open={addMechanicOpen}
                    onOpen={() => setAddMechanicOpen(true)}
                    onClose={() => setAddMechanicOpen(false)}
                    onChange={(e) => {
                        data.onAddMechanic(e.target.value as (typeof MECHANIC_KINDS)[number]);
                        setAddMechanicOpen(false);
                    }}
                    renderValue={() => "+ Добавить механику"}
                >
                    {MECHANIC_KINDS.map((kind) => (
                        <MenuItem key={kind} value={kind}>
                            {kind}
                        </MenuItem>
                    ))}
                </Select>

                {upgradeTierItems.length > 0 && (
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ContentCopyIcon fontSize="small" />}
                        disabled={ownMechanicCount === 0}
                        onClick={() => setConfirmingCopyToUpgrades(true)}
                    >
                        Механики в прокачки ({upgradeTierItems.length})
                    </Button>
                )}
            </Stack>

            <Dialog open={confirmingCopyToUpgrades} onClose={() => setConfirmingCopyToUpgrades(false)}>
                <DialogTitle>Скопировать механики в прокачки?</DialogTitle>
                <DialogContent>
                    <DialogContentText component="div">
                        Механики этого предмета ({ownMechanicCount} стр.) заменят механики следующих предметов:{" "}
                        {upgradeTierItems
                            .map((tierItem) => (typeof tierItem === "string" ? tierItem : store.itemName(tierItem)))
                            .join(", ")}
                        .
                        <Box component="p" sx={{ mt: 1, mb: 0 }}>
                            Собственные поля предметов (Value, Cost, Weight, теги и т.д.) не трогаются — именно
                            они и должны отличаться у прокачек. Счётчики{" "}
                            <code>ActivationCount</code>/<code>TargetCount</code>/<code>Duration</code>/
                            <code>Chance</code> у прокачки тоже сохраняются, если они там уже заданы.
                        </Box>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingCopyToUpgrades(false)}>Отмена</Button>
                    <Button color="primary" variant="contained" onClick={copyMechanicsToUpgrades}>
                        Скопировать
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={copyResult !== null}
                autoHideDuration={6000}
                onClose={() => setCopyResult(null)}
                message={copyResult ?? ""}
            />
        </Paper>
    );
}
