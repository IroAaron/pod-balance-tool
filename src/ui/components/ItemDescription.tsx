import { Box, Tooltip } from "@mui/material";
import { keyframes } from "@emotion/react";
import { useStore } from "../hooks/useStore";
import type { Item } from "../../core/models/Item";
import { parseItemDescription, type DescriptionSettings } from "../../core/domain/descriptionTemplate";

type Props = {
    item: Item;

    description: string;

    /** Overrides the shared Firestore settings — used by SettingsPage's live preview of unsaved slider values. */
    settingsOverride?: DescriptionSettings;
};

const shimmer = keyframes`
    from { background-position: 0% 0; }
    to { background-position: 200% 0; }
`;

/**
 * Renders an item's description per the site-wide description mode (Settings page): "text" shows the raw
 * translations-table string completely untouched (no {ValueOrRange}/[img]/[color] handling at all); "text-icons"
 * (the default, and the only mode that ever existed before) resolves those; "icons-emoji" does the same plus
 * swaps known glossary phrases (see GlossaryEntry) for their icon/emoji.
 */
export default function ItemDescription({ item, description, settingsOverride }: Props) {
    const store = useStore();
    const settings = settingsOverride ?? store.descriptionSettings;

    if (settings.descriptionMode === "text") {
        return (
            <Box component="span" sx={{ fontSize: settings.fontSizePx }}>
                {description}
            </Box>
        );
    }

    const glossary = settings.descriptionMode === "icons-emoji" ? store.glossary : [];
    const parts = parseItemDescription(item, description, store.mechanics, glossary);

    return (
        <>
            {parts.map((part, index) => {
                if (part.kind === "text") {
                    return (
                        <Box key={index} component="span" sx={{ fontSize: settings.fontSizePx }}>
                            {part.value}
                        </Box>
                    );
                }

                if (part.kind === "emoji") {
                    // `note` is only ever set on a glossary-sourced part (see applyGlossary) — a tooltip here
                    // surfaces which glossary entry/phrase it came from.
                    if (part.note) {
                        return (
                            <Tooltip key={index} title={part.note}>
                                <Box component="span" sx={{ fontSize: settings.fontSizePx }}>
                                    {part.value}
                                </Box>
                            </Tooltip>
                        );
                    }
                    return (
                        <Box key={index} component="span" sx={{ fontSize: settings.fontSizePx }}>
                            {part.value}
                        </Box>
                    );
                }

                if (part.kind === "icon") {
                    const width = Math.round(part.width * settings.spriteScale);
                    const imgStyle = { objectFit: "contain" as const, verticalAlign: "middle" as const, margin: "0 2px" };
                    const onImgError = (event: React.SyntheticEvent<HTMLImageElement>) => {
                        event.currentTarget.style.display = "none";
                    };

                    if (part.note) {
                        return (
                            <Tooltip key={index} title={part.note}>
                                <img
                                    src={part.src}
                                    alt={part.alt}
                                    width={width}
                                    height={width}
                                    style={imgStyle}
                                    onError={onImgError}
                                />
                            </Tooltip>
                        );
                    }
                    return (
                        <img
                            key={index}
                            src={part.src}
                            alt={part.alt}
                            width={width}
                            height={width}
                            style={imgStyle}
                            onError={onImgError}
                        />
                    );
                }

                // A single color renders as plain colored text; multiple colors (item has several PossibleColors)
                // shimmer left-to-right through all of them, per the user's explicit request.
                if (part.colors.length === 1) {
                    return (
                        <Box key={index} component="span" sx={{ fontSize: settings.fontSizePx, color: part.colors[0] }}>
                            {part.value}
                        </Box>
                    );
                }

                return (
                    <Box
                        key={index}
                        component="span"
                        sx={{
                            fontSize: settings.fontSizePx,
                            backgroundImage: `linear-gradient(90deg, ${[...part.colors, part.colors[0]].join(", ")})`,
                            backgroundSize: "200% 100%",
                            backgroundClip: "text",
                            WebkitBackgroundClip: "text",
                            color: "transparent",
                            animation: `${shimmer} 3s linear infinite`,
                        }}
                    >
                        {part.value}
                    </Box>
                );
            })}
        </>
    );
}
