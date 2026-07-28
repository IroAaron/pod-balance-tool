import { useState } from "react";
import { Tab, Tabs, Typography } from "@mui/material";
import PacksTab from "./PacksTab";
import DecksTab from "./DecksTab";

type TabKey = "packs" | "decks";

/** Read-only browser for the imported Packs/DecksShop sheets — same source data the Balance page's auto-computed
 *  shop-appearance probability (P) is built from, see domain/shopProbability.ts. */
export default function ShopPage() {
    const [tab, setTab] = useState<TabKey>("packs");

    return (
        <>
            <Typography variant="h4" sx={{ mb: 1 }}>
                Магазин
            </Typography>

            <Tabs value={tab} onChange={(_event, next: TabKey) => setTab(next)} sx={{ mb: 3 }}>
                <Tab value="packs" label="Паки" />
                <Tab value="decks" label="Колоды" />
            </Tabs>

            {tab === "packs" ? <PacksTab /> : <DecksTab />}
        </>
    );
}
