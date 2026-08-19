import { useState, type ReactNode } from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    Snackbar,
    Tooltip,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useStore } from "../../../hooks/useStore";
import type { Item } from "../../../../core/models/Item";

interface Props {
    /** The item whose section is being copied — its later chain tiers are the targets. */
    item: Item;

    /** What's being copied, e.g. "параметры". Used in the button tooltip and the dialog title. */
    what: string;

    /** Shown in the dialog above the tier list — say plainly what will be overwritten. */
    description: ReactNode;

    /** Loud warning for destructive copies (params overwrite the tiers' own balance numbers). */
    warning?: ReactNode;

    /** Runs the copy. May report how many tiers it actually touched; otherwise the target count is assumed. */
    onCopy: () => { tiers: number } | void;
}

/**
 * The shared "copy this section onto the item's + and ++" control, matching the name/description buttons the
 * card already had: an icon button that opens a confirm dialog naming the exact target tiers, since every one
 * of these overwrites data that can't be undone from here.
 */
export default function CopyToUpgradesButton({ item, what, description, warning, onCopy }: Props) {
    const store = useStore();
    const [confirming, setConfirming] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    const chain = store.chainForItem(item.id);
    const index = chain ? chain.itemIds.indexOf(item.id) : -1;
    const tierNames =
        chain && index !== -1
            ? chain.itemIds.slice(index + 1).map((tierId) => {
                  const tier = store.getItem(tierId);
                  return tier ? store.itemName(tier) : tierId;
              })
            : [];

    // Nothing downstream to copy into — the last tier of a chain, or an item that isn't in one.
    if (tierNames.length === 0) return null;

    const confirm = () => {
        const copied = onCopy();
        setConfirming(false);
        setResult(`Скопировано в прокачек: ${copied?.tiers ?? tierNames.length}.`);
    };

    return (
        <>
            <Tooltip title={`Скопировать ${what} в прокачки (+/++)`}>
                <IconButton size="small" aria-label={`Скопировать ${what} в прокачки`} onClick={() => setConfirming(true)}>
                    <ContentCopyIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Dialog open={confirming} onClose={() => setConfirming(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Скопировать {what} в прокачки?</DialogTitle>
                <DialogContent>
                    <DialogContentText component="div">
                        {description} Затронет: <strong>{tierNames.join(", ")}</strong>.
                    </DialogContentText>
                    {warning && (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            {warning}
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirming(false)}>Отмена</Button>
                    <Button variant="contained" onClick={confirm}>
                        Скопировать
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={result !== null}
                autoHideDuration={5000}
                onClose={() => setResult(null)}
                message={result ?? ""}
            />
        </>
    );
}
