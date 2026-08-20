import { useState } from "react";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    Stack,
    Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useStore } from "../../../hooks/useStore";
import DetailModal from "../../../components/DetailModal";
import EnumField from "../../../components/content/EnumField";
import ItemRefSelect from "../../../components/content/ItemRefSelect";
import EnumMultiSelect from "../../../components/content/EnumMultiSelect";
import { FIELD_TO_DIMENSION } from "../../../components/content/enumData";
import {
    MECHANIC_BLOCKS,
    MECHANIC_MISC_FIELDS,
    MULTI_VALUE_MECHANIC_FIELDS,
    PLAIN_ITEM_REF_FIELDS,
    splitFieldList,
    blockLabel,
    type MechanicKind,
} from "../../../components/content/mechanicSchema";
import type { MechanicRow } from "../../../../core/models/Mechanic";

interface Props {
    row: MechanicRow;
    onClose: () => void;
}

/** An id-reference column gets the searchable item picker, a list column a multi-select; everything else goes
 *  through the enum/plain field. */
function MechanicField({ field, value, onChange }: { field: string; value: string; onChange: (v: string) => void }) {
    if (PLAIN_ITEM_REF_FIELDS.has(field)) return <ItemRefSelect field={field} value={value} onChange={onChange} />;
    if (MULTI_VALUE_MECHANIC_FIELDS.has(field)) {
        return (
            <EnumMultiSelect
                dimension={FIELD_TO_DIMENSION[field] ?? field}
                label={field}
                value={splitFieldList(value)}
                onChange={(values) => onChange(values.join(", "))}
            />
        );
    }
    return <EnumField field={field} value={value} onChange={onChange} />;
}

/**
 * One mechanic's own card, opened over the item card. Fields are grouped the way the game reads them —
 * Activator / Target / the table's own extras (Bonus, NewColor, ...) — instead of one flat wall of columns,
 * which is the same grouping the schema already describes.
 */
export default function MechanicEditorModal({ row, onClose }: Props) {
    const store = useStore();
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const kind = row.table as MechanicKind;
    const blocks = MECHANIC_BLOCKS[kind] ?? [];
    const miscFields = MECHANIC_MISC_FIELDS[kind] ?? [];

    const setField = (field: string, value: string) => store.updateMechanicRowFields(row.id, { [field]: value });

    const remove = () => {
        store.deleteMechanicRow(row.id);
        setConfirmingDelete(false);
        onClose();
    };

    return (
        <>
            <DetailModal open onClose={onClose}>
                <Stack spacing={3}>
                    <Box>
                        <Typography variant="h5">{row.table}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Механика предмета {row.itemId}
                        </Typography>
                    </Box>

                    {blocks.map((block) => (
                        <Box key={block.kind}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                {blockLabel(block.kind)}
                            </Typography>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                                    gap: 2,
                                }}
                            >
                                {[block.primaryField, ...block.otherFields].map((field) => (
                                    <MechanicField
                                        key={field}
                                        field={field}
                                        value={row.fields[field] ?? ""}
                                        onChange={(value) => setField(field, value)}
                                    />
                                ))}
                            </Box>
                        </Box>
                    ))}

                    {miscFields.length > 0 && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Остальное
                            </Typography>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                                    gap: 2,
                                }}
                            >
                                {miscFields.map((field) => (
                                    <MechanicField
                                        key={field}
                                        field={field}
                                        value={row.fields[field] ?? ""}
                                        onChange={(value) => setField(field, value)}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}

                    <Divider />

                    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                        <Button
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={() => setConfirmingDelete(true)}
                        >
                            Удалить механику
                        </Button>
                        <Button variant="contained" onClick={onClose}>
                            Готово
                        </Button>
                    </Stack>
                </Stack>
            </DetailModal>

            <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
                <DialogTitle>Удалить эту механику?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Строка {row.table} для «{row.itemId}» будет убрана с сайта, а при экспорте — и из таблицы.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingDelete(false)}>Отмена</Button>
                    <Button color="error" variant="contained" onClick={remove}>
                        Удалить
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
