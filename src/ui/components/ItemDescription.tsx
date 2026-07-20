import { Fragment } from "react";
import type { Item } from "../../core/models/Item";
import { parseItemDescription } from "../../core/domain/descriptionTemplate";

type Props = {
    item: Item;

    description: string;
};

/** Renders an item's description text with {ValueOrRange}/{ValueOrRange2} substituted and [img] BBCode icons inlined. */
export default function ItemDescription({ item, description }: Props) {
    const parts = parseItemDescription(item, description);

    return (
        <>
            {parts.map((part, index) =>
                part.kind === "text" ? (
                    <Fragment key={index}>{part.value}</Fragment>
                ) : (
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
                )
            )}
        </>
    );
}
