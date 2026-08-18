import { memo, useState } from "react";
import { TextField } from "@mui/material";
import { useStore } from "../../hooks/useStore";

type Props = {
    deckId: string;
};

/** Editable site-only display name for a deck/ball deck (store.deckNames) — local-state-until-blur, same
 *  convention as every other text field in this session (avoids the re-render-mid-typing bug a direct
 *  value-bound-to-store TextField would hit). Purely a convenience label: never exported, see store.setDeckName. */
const DeckNameField = memo(function DeckNameField({ deckId }: Props) {
    const store = useStore();
    const [name, setName] = useState(store.getDeckName(deckId) ?? "");

    return (
        <TextField
            label="Название"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => store.setDeckName(deckId, name)}
            placeholder="Для удобства, не экспортируется"
            sx={{ minWidth: 220 }}
        />
    );
});

export default DeckNameField;
