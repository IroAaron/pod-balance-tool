import { Fragment } from "react";
import { Box } from "@mui/material";
import { keyframes } from "@emotion/react";
import { useStore } from "../hooks/useStore";
import type { Item } from "../../core/models/Item";
import { parseItemDescription } from "../../core/domain/descriptionTemplate";

type Props = {
    item: Item;

    description: string;
};

const shimmer = keyframes`
    from { background-position: 0% 0; }
    to { background-position: 200% 0; }
`;

/** Renders an item's description with {ValueOrRange}/etc. substituted and [img]/[color=#...] BBCode rendered. */
export default function ItemDescription({ item, description }: Props) {
    const store = useStore();
    const parts = parseItemDescription(item, description, store.mechanics);

    return (
        <>
            {parts.map((part, index) => {
                if (part.kind === "text") return <Fragment key={index}>{part.value}</Fragment>;

                if (part.kind === "icon") {
                    return (
                        <img
                            key={index}
                            src={part.src}
                            alt={part.alt}
                            width={part.width}
                            height={part.width}
                            style={{ objectFit: "contain", verticalAlign: "middle", margin: "0 2px" }}
                            onError={(event) => {
                                event.currentTarget.style.display = "none";
                            }}
                        />
                    );
                }

                // A single color renders as plain colored text; multiple colors (item has several PossibleColors)
                // shimmer left-to-right through all of them, per the user's explicit request.
                if (part.colors.length === 1) {
                    return (
                        <Box key={index} component="span" sx={{ color: part.colors[0] }}>
                            {part.value}
                        </Box>
                    );
                }

                return (
                    <Box
                        key={index}
                        component="span"
                        sx={{
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
