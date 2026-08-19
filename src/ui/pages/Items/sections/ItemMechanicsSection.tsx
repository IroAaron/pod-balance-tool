import { useState } from "react";
import { Box, Button, Chip, Menu, MenuItem, Paper, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useStore } from "../../../hooks/useStore";
import { MECHANIC_KINDS } from "../../../components/content/mechanicSchema";
import SectionPaper from "./SectionPaper";
import CopyToUpgradesButton from "./CopyToUpgradesButton";
import MechanicEditorModal from "./MechanicEditorModal";
import type { Item } from "../../../../core/models/Item";
import type { MechanicRow } from "../../../../core/models/Mechanic";

/** The handful of fields worth showing on the closed card, so the column is scannable without opening each one. */
const SUMMARY_FIELDS = ["ActivatorType", "TargetType", "TargetValueType", "ItemMech", "TagMech", "NewColor"];

function MechanicCard({ row, onOpen }: { row: MechanicRow; onOpen: () => void }) {
    const summary = SUMMARY_FIELDS.filter((field) => row.fields[field]).map(
        (field) => [field, row.fields[field]] as const
    );
    const filled = Object.values(row.fields).filter(Boolean).length;

    return (
        <Paper
            variant="outlined"
            onClick={onOpen}
            sx={{
                p: 1.5,
                cursor: "pointer",
                "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
            }}
        >
            <Stack spacing={1}>
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                    <Typography variant="subtitle2">{row.table}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        заполнено полей: {filled}
                    </Typography>
                </Stack>

                {summary.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                        Пока ничего не заполнено — нажмите, чтобы настроить.
                    </Typography>
                ) : (
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {summary.map(([field, value]) => (
                            <Chip key={field} size="small" label={`${field}: ${value}`} />
                        ))}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
}

export default function ItemMechanicsSection({ item }: { item: Item }) {
    const store = useStore();
    const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
    const [openRowId, setOpenRowId] = useState<string | null>(null);

    const rows = store.mechanics.filter((row) => row.itemId === item.id);
    // Looked up by id rather than held as an object so the modal always renders the store's current row.
    const openRow = rows.find((row) => row.id === openRowId);

    return (
        <SectionPaper
            title={`Механики (${rows.length})`}
            actions={
                <>
                    <Button size="small" startIcon={<AddIcon />} onClick={(e) => setAddAnchor(e.currentTarget)}>
                        Добавить
                    </Button>
                    <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
                        {MECHANIC_KINDS.map((kind) => (
                            <MenuItem
                                key={kind}
                                onClick={() => {
                                    const row = store.addMechanicRow(item.id, kind);
                                    setAddAnchor(null);
                                    setOpenRowId(row.id);
                                }}
                            >
                                {kind}
                            </MenuItem>
                        ))}
                    </Menu>

                    <CopyToUpgradesButton
                        item={item}
                        what="механики"
                        description="Механики этого предмета заменят механики его прокачек."
                        warning={
                            <>
                                Счётчики <code>ActivationCount</code>/<code>TargetCount</code>/<code>Duration</code>/
                                <code>Chance</code> у прокачки сохранятся, если там уже заданы свои значения —
                                обычно именно ими прокачка и отличается.
                            </>
                        }
                        onCopy={() => store.copyMechanicsToUpgrades(item.id)}
                    />
                </>
            }
        >
            {rows.length === 0 ? (
                <Typography color="text.secondary">
                    Механик нет. «Добавить» создаст строку выбранной таблицы и сразу откроет её.
                </Typography>
            ) : (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: 1.5,
                    }}
                >
                    {rows.map((row) => (
                        <MechanicCard key={row.id} row={row} onOpen={() => setOpenRowId(row.id)} />
                    ))}
                </Box>
            )}

            {openRow && <MechanicEditorModal row={openRow} onClose={() => setOpenRowId(null)} />}
        </SectionPaper>
    );
}
