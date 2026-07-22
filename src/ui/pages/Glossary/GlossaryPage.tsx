import { useState } from "react";
import { Tab, Tabs, Typography } from "@mui/material";
import PhraseGlossaryTab from "./PhraseGlossaryTab";
import TagIconsTab from "./TagIconsTab";

type TabKey = "phrases" | "tagIcons";

/**
 * "Значки" (phrase → icon/emoji, used by the description modes) and "Иконки тегов" (tag → icon, used when
 * inserting a tag's icon into a description) — two independent curated lists, each with their own Firestore doc
 * (see PhraseGlossaryTab/TagIconsTab). Item icons don't get a tab here at all — inserting an item's icon into a
 * description reuses the real Items list directly (its own sprite/manual-icon), so there's no separate curated
 * data for it to manage.
 */
export default function GlossaryPage() {
    const [tab, setTab] = useState<TabKey>("phrases");

    return (
        <>
            <Typography variant="h4" sx={{ mb: 1 }}>
                Глоссарий
            </Typography>

            <Tabs value={tab} onChange={(_event, next: TabKey) => setTab(next)} sx={{ mb: 3 }}>
                <Tab value="phrases" label="Значки" />
                <Tab value="tagIcons" label="Иконки тегов" />
            </Tabs>

            {tab === "phrases" ? <PhraseGlossaryTab /> : <TagIconsTab />}
        </>
    );
}
