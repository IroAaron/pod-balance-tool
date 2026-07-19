import type { ReactNode } from "react";
import { Dialog, DialogContent, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

type Props = {
    open: boolean;

    onClose: () => void;

    children: ReactNode;
};

/**
 * "Внутреннее окно" — an item/build detail page rendered as an overlay on top of the current page (Builds/Graph)
 * instead of a full navigation, with a close (×) button in the top-right corner. Links inside the detail content
 * (item/build chips, related items, etc.) are still real RouterLinks, so clicking one navigates to a full page as
 * usual and unmounts this overlay along with whatever page opened it — no special close-on-navigate handling
 * needed here.
 */
export default function DetailModal({ open, onClose, children }: Props) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
            <IconButton
                onClick={onClose}
                aria-label="Закрыть"
                size="small"
                sx={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 1,
                    bgcolor: "background.paper",
                    "&:hover": { bgcolor: "action.hover" },
                }}
            >
                <CloseIcon fontSize="small" />
            </IconButton>
            <DialogContent sx={{ pt: 5 }}>{children}</DialogContent>
        </Dialog>
    );
}
