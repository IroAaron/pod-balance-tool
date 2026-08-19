import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { useStore } from "../../../hooks/useStore";
import ItemRefSelect from "../../../components/content/ItemRefSelect";
import SectionPaper from "./SectionPaper";
import type { Item } from "../../../../core/models/Item";

/** The dashed "+" circle that ends the chain — the affordance for adding the next tier. */
function AddTierCircle({ onClick }: { onClick: () => void }) {
    return (
        <Tooltip title="Добавить прокачку">
            <Box
                onClick={onClick}
                role="button"
                aria-label="Добавить прокачку"
                sx={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "2px dashed",
                    borderColor: "divider",
                    color: "text.secondary",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    "&:hover": { borderColor: "primary.main", color: "primary.main" },
                }}
            >
                <AddIcon fontSize="small" />
            </Box>
        </Tooltip>
    );
}

export default function ItemUpgradeChainSection({ item }: { item: Item }) {
    const store = useStore();
    const navigate = useNavigate();
    const [adding, setAdding] = useState(false);
    const [pickedId, setPickedId] = useState("");

    const chain = store.chainForItem(item.id);
    const chainId = chain?.id ?? `up_${item.id}`;
    const tierIds = chain?.itemIds ?? [item.id];

    const attachExisting = () => {
        if (!pickedId || tierIds.includes(pickedId)) return;
        store.setUpgradeChain(chainId, [...tierIds, pickedId]);
        setPickedId("");
        setAdding(false);
    };

    const generate = () => {
        const newId = store.createNextTier(item.id);
        setAdding(false);
        if (newId) navigate(`/items/${encodeURIComponent(newId)}`);
    };

    return (
        <SectionPaper title="Цепочка прокачки">
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                {tierIds.map((tierId, index) => {
                    const tierItem = store.getItem(tierId);
                    return (
                        <Stack key={tierId} direction="row" sx={{ alignItems: "center", gap: 1 }}>
                            {index > 0 && <Typography color="text.secondary">→</Typography>}
                            <Chip
                                label={tierItem ? store.itemName(tierItem) : tierId}
                                component={RouterLink}
                                to={`/items/${encodeURIComponent(tierId)}`}
                                clickable
                                color={tierId === item.id ? "primary" : "default"}
                                // Unlinks from the chain only — the item itself stays in the content.
                                onDelete={chain ? () => store.removeItemFromChain(chainId, tierId) : undefined}
                            />
                        </Stack>
                    );
                })}

                <Typography color="text.secondary">→</Typography>
                <AddTierCircle onClick={() => setAdding(true)} />
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                Крестик убирает предмет только из цепочки — сам предмет остаётся в контенте.
            </Typography>

            <Dialog open={adding} onClose={() => setAdding(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Добавить прокачку</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ pt: 1 }}>
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Создать новую
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Копия «{store.itemName(item)}» со всеми параметрами, тегами, описанием и механиками.
                                Название — как у последней прокачки в цепочке, плюс «+».
                            </Typography>
                            <Button variant="contained" startIcon={<AutoAwesomeIcon />} onClick={generate}>
                                Сгенерировать
                            </Button>
                        </Box>

                        <Divider>или</Divider>

                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Взять существующий предмет
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                                <Box sx={{ flex: 1 }}>
                                    <ItemRefSelect field="Предмет" value={pickedId} onChange={setPickedId} />
                                </Box>
                                <Button
                                    variant="outlined"
                                    disabled={!pickedId || tierIds.includes(pickedId)}
                                    onClick={attachExisting}
                                >
                                    Добавить
                                </Button>
                            </Stack>
                            {pickedId && tierIds.includes(pickedId) && (
                                <Typography variant="caption" color="text.secondary">
                                    Этот предмет уже в цепочке.
                                </Typography>
                            )}
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAdding(false)}>Закрыть</Button>
                </DialogActions>
            </Dialog>
        </SectionPaper>
    );
}
