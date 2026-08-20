import { useState } from "react";
import {
    Box,
    Chip,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import { useStore } from "../../../hooks/useStore";
import ItemIcon from "../../../components/ItemIcon";
import { BALANCED_COLUMNS, columnAppliesTo, type BalancedColumn } from "../../../../core/domain/rarityBalance";
import type { Item } from "../../../../core/models/Item";

interface Props {
    items: Item[];
    /** Item ids whose ValueMin/ValueMax are edited independently; everything else moves both together. */
    unlinkedIds: Set<string>;
    onToggleLink: (itemId: string) => void;
    onOpenItem: (itemId: string) => void;
}

/** The input half of a cell, alive only while that one cell is being edited. */
function NumberEditor({ value, onDone }: { value: string; onDone: (next: string) => void }) {
    const [draft, setDraft] = useState(value);

    return (
        <TextField
            size="small"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => onDone(draft.trim())}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                if (event.key === "Escape") onDone(value);
            }}
            onClick={(event) => event.stopPropagation()}
            sx={{ width: 78, "& input": { py: 0.5, px: 0.75, fontSize: 13, textAlign: "right" } }}
        />
    );
}

/**
 * A cell that shows plain text until it's actually being edited.
 *
 * With upgrade tiers shown this table is 225 rows × 4 numbers, and a permanent MUI TextField in each would put
 * ~900 of them on the page — every one re-rendering on every keystroke anywhere, since a store edit notifies the
 * whole tree. Mounting the input only for the focused cell keeps that at one.
 *
 * Focus alone opens the editor, so Tab still walks across the row and straight into typing — which is how this
 * page actually gets used, going down a column filling numbers in.
 */
function NumberCell({
    value,
    disabled,
    onCommit,
}: {
    value: string;
    disabled?: boolean;
    onCommit: (next: string) => void;
}) {
    const [editing, setEditing] = useState(false);

    if (disabled) {
        return (
            <Typography variant="caption" color="text.disabled">
                —
            </Typography>
        );
    }

    if (editing) {
        return (
            <NumberEditor
                value={value}
                onDone={(next) => {
                    setEditing(false);
                    if (next !== value) onCommit(next);
                }}
            />
        );
    }

    return (
        <Box
            component="span"
            role="button"
            tabIndex={0}
            onClick={(event) => {
                event.stopPropagation();
                setEditing(true);
            }}
            onFocus={() => setEditing(true)}
            sx={{
                display: "inline-block",
                minWidth: 78,
                px: 0.75,
                py: 0.5,
                fontSize: 13,
                textAlign: "right",
                borderRadius: 1,
                border: "1px solid transparent",
                cursor: "text",
                color: value ? "text.primary" : "text.disabled",
                "&:hover, &:focus-visible": { borderColor: "divider", bgcolor: "action.hover" },
            }}
        >
            {value || "—"}
        </Box>
    );
}

export default function ValuesTable({ items, unlinkedIds, onToggleLink, onOpenItem }: Props) {
    const store = useStore();

    const setColumn = (item: Item, column: BalancedColumn, value: string) => {
        const patch: Record<string, string> = { [column]: value };
        // Min and Max are equal on every single row in the real data, so they move together unless unlinked.
        if (!unlinkedIds.has(item.id) && (column === "ValueMin" || column === "ValueMax")) {
            patch.ValueMin = value;
            patch.ValueMax = value;
        }
        store.upsertItem(item.id, item.itemType ?? "Card", { raw: patch });
    };

    return (
        <TableContainer sx={{ maxHeight: "60vh" }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: 44 }} />
                        <TableCell sx={{ minWidth: 150 }}>Название</TableCell>
                        <TableCell sx={{ minWidth: 240 }}>Описание</TableCell>
                        <TableCell sx={{ width: 90 }}>Редкость</TableCell>
                        {BALANCED_COLUMNS.map((entry) => (
                            <TableCell key={entry.column} align="right" sx={{ width: 92 }}>
                                {entry.label}
                            </TableCell>
                        ))}
                        <TableCell sx={{ width: 44 }} />
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.map((item) => {
                        const linked = !unlinkedIds.has(item.id);
                        const rarity = (item.raw.Rarity ?? "").trim();

                        return (
                            <TableRow
                                key={item.id}
                                hover
                                sx={{ cursor: "pointer" }}
                                onClick={() => onOpenItem(item.id)}
                            >
                                <TableCell>
                                    <ItemIcon item={item} size={32} />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2">{store.itemName(item)}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {item.id} · {item.itemType}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="caption" color="text.secondary">
                                        {store.itemDescription(item) || "—"}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    {rarity ? (
                                        <Chip label={rarity} size="small" variant="outlined" />
                                    ) : (
                                        <Typography variant="caption" color="text.disabled">
                                            —
                                        </Typography>
                                    )}
                                </TableCell>

                                {BALANCED_COLUMNS.map((entry) => (
                                    <TableCell key={entry.column} align="right">
                                        <NumberCell
                                            value={item.raw[entry.column] ?? ""}
                                            disabled={!columnAppliesTo(entry.column, item.itemType)}
                                            onCommit={(next) => setColumn(item, entry.column, next)}
                                        />
                                    </TableCell>
                                ))}

                                <TableCell>
                                    <Tooltip
                                        title={
                                            linked
                                                ? "ValueMin и ValueMax связаны — правка одного меняет оба"
                                                : "ValueMin и ValueMax правятся раздельно"
                                        }
                                    >
                                        <IconButton
                                            size="small"
                                            aria-label={linked ? "Разорвать связь Min/Max" : "Связать Min/Max"}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onToggleLink(item.id);
                                            }}
                                        >
                                            {linked ? (
                                                <LinkIcon sx={{ fontSize: 16 }} />
                                            ) : (
                                                <LinkOffIcon sx={{ fontSize: 16, opacity: 0.5 }} />
                                            )}
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        );
                    })}

                    {items.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={9}>
                                <Box sx={{ py: 3, textAlign: "center" }}>
                                    <Typography variant="body2" color="text.secondary">
                                        Ничего не найдено по текущим фильтрам.
                                    </Typography>
                                </Box>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
