import { useState } from "react";
import { Box, IconButton } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { glossaryIconSrc } from "../../../core/domain/descriptionTemplate";

/** Reserved footprint for a preview (icon image or emoji glyph) next to its field — always occupies this much
 *  space, present or not, so a row with an icon/emoji set doesn't push its own fields wider than an otherwise
 *  identical row without one. Shared by both the phrase-glossary and tag-icons tabs. */
// eslint-disable-next-line react-refresh/only-export-components -- a plain sx constant, not a component
export const PREVIEW_SLOT_SX = { width: 28, height: 28, flexShrink: 0 } as const;

/** Small live preview of an icon path — same resolution as the real description renderer (glossaryIconSrc),
 *  hidden on load error instead of showing a broken-image icon. Resets the "failed" flag when `icon` itself
 *  changes, via React's adjust-state-during-render idiom (not an effect) — comparing against the last-seen icon. */
export function IconPreview({ icon }: { icon: string | undefined }) {
    const [failed, setFailed] = useState(false);
    const [trackedIcon, setTrackedIcon] = useState(icon);

    if (icon !== trackedIcon) {
        setTrackedIcon(icon);
        setFailed(false);
    }

    if (!icon || failed) return <Box sx={PREVIEW_SLOT_SX} />;
    return (
        <Box
            component="img"
            src={glossaryIconSrc(icon)}
            alt=""
            sx={{ ...PREVIEW_SLOT_SX, objectFit: "contain" }}
            onError={() => setFailed(true)}
        />
    );
}

/**
 * The gap below a row — invisible until hovered, at which point a "+" appears centered in it to insert a new
 * entry right there. Driven by onMouseEnter/Leave state rather than a CSS `:hover` descendant selector — MUI's
 * own emitted rule for the button's baseline `opacity: 0` sx otherwise wins the cascade over a plain class-based
 * hover selector regardless of specificity (order-dependent, not worth fighting), so state is the reliable path.
 */
export function InsertDivider({ onInsert }: { onInsert: () => void }) {
    const [hovered, setHovered] = useState(false);

    return (
        <Box
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            sx={{ position: "relative", height: 20 }}
        >
            <IconButton
                aria-label="Добавить запись здесь"
                onClick={onInsert}
                size="small"
                sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    opacity: hovered ? 1 : 0,
                    transition: "opacity 0.15s",
                    bgcolor: "background.paper",
                    border: "1px solid",
                    borderColor: "divider",
                    "&:hover": { bgcolor: "action.hover" },
                }}
            >
                <AddIcon fontSize="small" />
            </IconButton>
        </Box>
    );
}
