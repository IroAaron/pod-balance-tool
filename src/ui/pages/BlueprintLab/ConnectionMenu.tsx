import { Button, ClickAwayListener, Divider, MenuItem, MenuList, Paper, Typography } from "@mui/material";
import type { ItemFlowNode } from "./types";

interface Props {
    x: number;
    y: number;
    roleLabel: string;
    candidates: ItemFlowNode[];
    onPick: (itemId: string) => void;
    onCreate: () => void;
    onClose: () => void;
}

export default function ConnectionMenu({ x, y, roleLabel, candidates, onPick, onCreate, onClose }: Props) {
    return (
        <ClickAwayListener onClickAway={onClose}>
            <Paper
                elevation={6}
                sx={{ position: "absolute", left: x, top: y, zIndex: 20, width: 240 }}
            >
                <Typography variant="caption" sx={{ px: 1.5, py: 1, display: "block", color: "text.secondary" }}>
                    Подключить «{roleLabel}» к…
                </Typography>
                <Divider />
                <MenuList dense sx={{ maxHeight: 220, overflowY: "auto" }}>
                    {candidates.map((node) => (
                        <MenuItem key={node.id} onClick={() => onPick(node.id)}>
                            {node.data.name || "(без имени)"} · {node.data.itemType}
                        </MenuItem>
                    ))}
                    {candidates.length === 0 && (
                        <MenuItem disabled>Нет предметов на холсте</MenuItem>
                    )}
                </MenuList>
                <Divider />
                <Button fullWidth size="small" onClick={onCreate} sx={{ borderRadius: 0 }}>
                    + Новый предмет
                </Button>
            </Paper>
        </ClickAwayListener>
    );
}
